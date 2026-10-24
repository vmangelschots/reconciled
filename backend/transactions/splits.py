"""Splitting a transaction into parts.

A split transaction keeps the bank's line (account, date, payee, amount)
and has no category of its own. Its parts are ordinary transactions whose
`split_parent` points at it, each with its own amount and a category, a
transfer or neither, so categorizing and transfers work on them unchanged.
Every rule about splits lives here so the API and the ledger behave the
same - see openspec/specs/transaction-splits.
"""

from dataclasses import dataclass

from django.db import transaction as db_transaction

from . import transfers
from .models import Transaction


class SplitError(ValueError):
    """The split isn't allowed. `line` is the index of the line it is
    about, when it is about one, so the editor can mark it."""

    def __init__(self, message, line=None):
        super().__init__(message)
        self.line = line


@dataclass
class SplitLine:
    """One part as the user asked for it. `id` is an existing part to keep;
    at most one of `category` and `transfer_account` is set."""

    amount_cents: int
    category: object = None
    transfer_account: object = None
    notes: str = ""
    id: int | None = None


def _locked(pk):
    return Transaction.objects.select_for_update().select_related("account").get(pk=pk)


def _validate(txn, lines):
    if txn.split_parent_id is not None:
        raise SplitError("A part can't be split again.")
    if txn.transfer_counterpart_id is not None:
        raise SplitError("A transfer can't be split. Pick a category for it first.")
    if len(lines) < 2:
        raise SplitError("A split needs at least two parts.")
    outflow = txn.amount_cents < 0
    for index, line in enumerate(lines):
        if line.amount_cents == 0:
            raise SplitError("Each part needs an amount.", line=index)
        if (line.amount_cents < 0) != outflow:
            raise SplitError("Each part must have the same sign as the transaction.", line=index)
        if line.category is not None and line.transfer_account is not None:
            raise SplitError("A part can't have both a category and a transfer.", line=index)
    if sum(line.amount_cents for line in lines) != txn.amount_cents:
        raise SplitError("The parts must add up to the transaction's amount.")
    existing = set(txn.parts.values_list("pk", flat=True))
    seen = set()
    for index, line in enumerate(lines):
        if line.id is None:
            continue
        if line.id not in existing or line.id in seen:
            raise SplitError("Unknown part.", line=index)
        seen.add(line.id)


def _clear_category(txn):
    txn.category = None
    txn.category_confirmed = True
    txn.category_source = Transaction.CategorySource.MANUAL
    txn.category_reason = ""


def _set_target(part, category, transfer_account):
    """Give a part its category, transfer or neither, the same way the
    ledger does for a whole transaction."""
    if transfer_account is not None:
        transfers.link_transfer(part, transfer_account)
        return
    transfers.unlink_transfer(part)
    part = _locked(part.pk)
    _clear_category(part)
    part.category = category
    part.save(
        update_fields=["category", "category_confirmed", "category_source", "category_reason", "updated_at"]
    )


@db_transaction.atomic
def save_split(txn, lines):
    """Split `txn` into `lines` (a list of SplitLine), or change its
    existing split: parts named by id are kept and updated, the others are
    removed, lines without an id become new parts. Returns `txn` refreshed.
    Raises SplitError; nothing is saved then."""
    txn = _locked(txn.pk)
    _validate(txn, lines)

    _clear_category(txn)
    txn.save(update_fields=["category", "category_confirmed", "category_source", "category_reason", "updated_at"])

    kept = {line.id for line in lines if line.id is not None}
    for part in txn.parts.exclude(pk__in=kept):
        transfers.delete_transaction(part)

    for index, line in enumerate(lines):
        if line.id is None:
            part = Transaction.objects.create(
                account=txn.account,
                date=txn.date,
                payee=txn.payee,
                amount_cents=line.amount_cents,
                notes=line.notes,
                split_parent=txn,
            )
        else:
            part = _locked(line.id)
            amount_changed = part.amount_cents != line.amount_cents
            part.amount_cents = line.amount_cents
            part.notes = line.notes
            part.save(update_fields=["amount_cents", "notes", "updated_at"])
            if amount_changed:
                transfers.mirror_edit(part)
        try:
            _set_target(part, line.category, line.transfer_account)
        except transfers.TransferError as e:
            raise SplitError(str(e), line=index) from e

    return Transaction.objects.get(pk=txn.pk)


@db_transaction.atomic
def unsplit(txn, category=None, transfer_account=None):
    """Remove `txn`'s parts (unlinking transfer parts) and give it the
    category or transfer the user chose to keep, or none. Returns `txn`
    refreshed. Raises SplitError if it isn't split, TransferError if the
    kept transfer isn't allowed."""
    txn = _locked(txn.pk)
    if not txn.parts.exists():
        raise SplitError("This transaction isn't split.")
    # Parts go first, so a kept transfer target matches the whole amount
    # and never the counterpart of a part that is about to disappear.
    for part in txn.parts.all():
        transfers.delete_transaction(part)
    _clear_category(txn)
    txn.category = category
    txn.save(update_fields=["category", "category_confirmed", "category_source", "category_reason", "updated_at"])
    if transfer_account is not None:
        transfers.link_transfer(txn, transfer_account)
    return Transaction.objects.get(pk=txn.pk)


@db_transaction.atomic
def delete_transaction(txn):
    """Delete a transaction with its parts, unlinking (or removing created)
    transfer counterparts. A part is only removed by editing its split."""
    txn = _locked(txn.pk)
    if txn.split_parent_id is not None:
        raise SplitError("A part can only be removed by editing its split.")
    for part in txn.parts.all():
        transfers.delete_transaction(part)
    transfers.delete_transaction(txn)


@db_transaction.atomic
def sync_parts(txn):
    """After a split transaction's date or payee changed, bring its parts
    (and their created transfer counterparts) in line."""
    txn = _locked(txn.pk)
    for part in txn.parts.select_for_update():
        part.date = txn.date
        part.payee = txn.payee
        part.save(update_fields=["date", "payee", "updated_at"])
        transfers.mirror_edit(part)

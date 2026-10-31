"""Transfers between two of the user's accounts.

A transfer is two ordinary transactions whose `transfer_counterpart`
points at each other. Every rule about them lives here so the API, the
transaction form and the import all behave the same - see
openspec/specs/account-transfers.
"""

from datetime import timedelta

from django.db import transaction as db_transaction
from django.db.models import Q

from accounts.models import Loan

from .models import Transaction

# How far apart (in days, either way) the two sides may be dated and
# still be matched: banks often book the receiving side a few days later.
TRANSFER_MATCH_DAYS = 5


class TransferError(ValueError):
    """The requested transfer isn't allowed (same or archived account)."""


def _locked(txn):
    return Transaction.objects.select_for_update().select_related("account").get(pk=txn.pk)


def _counterpart_payee(txn):
    # The counterpart moves the money the other way: an outflow here is an
    # inflow there.
    if txn.amount_cents < 0:
        return f"Transfer from {txn.account.name}"
    return f"Transfer to {txn.account.name}"


def _find_match(txn, target_account):
    window = timedelta(days=TRANSFER_MATCH_DAYS)
    candidates = (
        # A split transaction or a part is never the other side: the
        # bank line and its parts carry the amount separately.
        # Nor is a value adjustment.
        Transaction.objects.counted_rows()
        .ledger_rows()
        .excluding_adjustments()
        .select_for_update()
        .filter(
            account=target_account,
            transfer_counterpart__isnull=True,
            amount_cents=-txn.amount_cents,
            date__gte=txn.date - window,
            date__lte=txn.date + window,
        )
        .exclude(pk=txn.pk)
    )
    # Closest date wins; the lowest id breaks ties so the choice is stable.
    return min(candidates, key=lambda c: (abs((c.date - txn.date).days), c.pk), default=None)


def _unlink(txn):
    """Unlink a locked transaction; returns nothing. A counterpart the app
    created (and no import confirmed) only existed because of the transfer,
    so it is deleted rather than left behind."""
    counterpart = txn.transfer_counterpart
    if counterpart is None:
        return
    txn.transfer_counterpart = None
    txn.created_by_transfer = False
    txn.save(update_fields=["transfer_counterpart", "created_by_transfer", "updated_at"])
    counterpart = _locked(counterpart)
    if counterpart.created_by_transfer:
        counterpart.delete()
    else:
        counterpart.transfer_counterpart = None
        counterpart.save(update_fields=["transfer_counterpart", "updated_at"])


@db_transaction.atomic
def link_transfer(txn, target_account):
    """Make `txn` a transfer to/from `target_account`: link the closest
    opposite-amount transaction there within the window, or create one.
    Returns (txn, counterpart), both refreshed."""
    txn = _locked(txn)
    if target_account.pk == txn.account_id:
        raise TransferError("A transfer must go to a different account.")
    if target_account.archived:
        raise TransferError("Archived accounts can't be used for new transfers.")
    if txn.parts.exists():
        raise TransferError("A split transaction can't be a transfer. Unsplit it first.")
    if txn.is_adjustment:
        raise TransferError("A value adjustment can't be a transfer.")
    # The schedule already posts the principal; a transfer would count it
    # twice. See openspec/specs/loan-schedules.
    if Loan.objects.filter(account=target_account, paid_from_id=txn.account_id).exists():
        raise TransferError(
            f"{target_account.name} follows its loan schedule, which already posts what this account pays."
        )

    if txn.transfer_counterpart_id is not None:
        if txn.transfer_counterpart.account_id == target_account.pk:
            return txn, txn.transfer_counterpart
        _unlink(txn)
        txn = _locked(txn)

    counterpart = _find_match(txn, target_account)
    if counterpart is None:
        counterpart = Transaction.objects.create(
            account=target_account,
            date=txn.date,
            amount_cents=-txn.amount_cents,
            payee=_counterpart_payee(txn),
            created_by_transfer=True,
        )
    else:
        counterpart.category = None

    # A transfer is never spending, so neither side keeps a category.
    txn.category = None
    txn.transfer_counterpart = counterpart
    txn.save(update_fields=["category", "transfer_counterpart", "updated_at"])
    counterpart.transfer_counterpart = txn
    counterpart.save(update_fields=["category", "transfer_counterpart", "updated_at"])
    return txn, counterpart


@db_transaction.atomic
def link_pair(a, b):
    """Link two bank lines known to be the two sides of one move (a Revolut
    pocket move, both sides in the same import) directly to each other -
    never by the closest-date search, which could pick another line with
    the same amount. Both came from the bank, so neither is marked as
    created by the transfer and later edits stay independent."""
    for line, other in ((a, b), (b, a)):
        line.category = None
        # Whatever was guessed goes with the category.
        line.category_confirmed = True
        line.category_source = Transaction.CategorySource.MANUAL
        line.category_reason = ""
        line.transfer_counterpart = other
        line.save(
            update_fields=[
                "category",
                "category_confirmed",
                "category_source",
                "category_reason",
                "transfer_counterpart",
                "updated_at",
            ]
        )


def _linkable(account_ids):
    """Lines automatic linking may touch: never a choice of the user's - a
    confirmed category, a split or a part of one, a line already linked or
    matched to a loan payment - and only in linked accounts."""
    return (
        Transaction.objects.counted_rows()
        .ledger_rows()
        .excluding_adjustments()
        .filter(
            Q(category__isnull=True) | Q(category_confirmed=False),
            account__in=account_ids,
            transfer_counterpart__isnull=True,
            loan_adjustment__isnull=True,
        )
    )


def _opposite_lines(line, account_ids):
    window = timedelta(days=TRANSFER_MATCH_DAYS)
    return list(
        _linkable(account_ids)
        .exclude(account=line.account_id)
        .filter(
            amount_cents=-line.amount_cents,
            date__gte=line.date - window,
            date__lte=line.date + window,
        )
    )


def auto_link_transfers(new_lines, account_ids):
    """Link each of `new_lines` (just synced) with its other side in another
    of `account_ids`, when each is the other's single match. See
    openspec/specs/bank-sync."""
    for line in new_lines:
        line = _linkable(account_ids).filter(pk=line.pk).first()
        if line is None:
            continue
        matches = _opposite_lines(line, account_ids)
        if len(matches) == 1 and [t.pk for t in _opposite_lines(matches[0], account_ids)] == [line.pk]:
            link_pair(line, matches[0])


@db_transaction.atomic
def unlink_transfer(txn):
    """Turn a transfer back into a normal transaction (no-op if it isn't one)."""
    _unlink(_locked(txn))


@db_transaction.atomic
def delete_transaction(txn):
    """Delete a transaction, unlinking (or removing a created) counterpart."""
    txn = _locked(txn)
    _unlink(txn)
    txn.delete()


@db_transaction.atomic
def mirror_edit(txn):
    """After `txn`'s amount or date changed, bring a created counterpart in
    line. Two confirmed sides come from two banks and stay independent."""
    txn = _locked(txn)
    counterpart = txn.transfer_counterpart
    if counterpart is None or not counterpart.created_by_transfer:
        return
    counterpart = _locked(counterpart)
    counterpart.amount_cents = -txn.amount_cents
    counterpart.date = txn.date
    counterpart.save(update_fields=["amount_cents", "date", "updated_at"])

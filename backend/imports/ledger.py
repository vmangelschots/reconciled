"""Posting bank lines to the ledger: what a file import's commit and a bank
sync share, so they can't drift apart."""

from django.utils import timezone

from transactions.adjustments import recompute_if_valued
from transactions.categorize import categorize
from transactions.loans import sync_loans
from transactions.models import Transaction


def new_transaction(account, candidate):
    """The unsaved transaction for a candidate."""
    notes = candidate["description"] if candidate["description"] != candidate["payee"] else ""
    return Transaction(
        account=account,
        date=candidate["date"],
        amount_cents=candidate["amount_cents"],
        payee=candidate["payee"],
        notes=notes,
    )


def confirm_transfer_counterpart(account, candidate, notes):
    """If the candidate matched a created transfer counterpart, overwrite
    that counterpart with the bank's line (keeping the link) and return
    True. If the counterpart is gone or no longer unconfirmed since the
    match, return False so the line is created normally."""
    match = candidate.get("transfer_match")
    if not match:
        return False
    txn = (
        Transaction.objects.select_for_update()
        .filter(
            pk=match["transaction_id"],
            account=account,
            created_by_transfer=True,
            transfer_counterpart__isnull=False,
        )
        .first()
    )
    if txn is None:
        return False
    txn.date = candidate["date"]
    txn.payee = candidate["payee"]
    txn.notes = notes
    txn.created_by_transfer = False
    txn.save(update_fields=["date", "payee", "notes", "created_by_transfer", "updated_at"])
    return True


def settle_accounts(account_ids):
    """bulk_create sends no signals, so value adjustments in the accounts
    posted to are brought up to date here."""
    for account_id in set(account_ids):
        recompute_if_valued(account_id)


def settle_new_transactions(transactions):
    """Guess categories and match loan payments for lines just posted.
    Guessing runs after the lines have committed, as a second save: a slow
    or failing AI step can never roll them back, and the Review page's
    backfill can redo it. Returns the categorize result."""
    categorized = categorize(transactions)
    # After guessing, so a matched loan payment ends with the loan's
    # category rather than a guess - see openspec/specs/loan-schedules.
    sync_loans(timezone.localdate())
    return categorized

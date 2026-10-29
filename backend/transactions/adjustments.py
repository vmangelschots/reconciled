"""Value adjustments: the value of an investment, property or loan account
set by hand on a date. See openspec/specs/value-adjustments.

An adjustment is a ledger row holding the value set
(adjustment_value_cents). Its amount is that value minus the balance at
the end of its date without it, so the balance on its date is always the
value set. When anything on or before that date changes, the amounts are
recomputed; the signals below catch single-row writes, and code that
writes in bulk (imports) calls recompute_adjustments itself.
"""

from django.db import transaction as db_transaction
from django.db.models import Sum
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from accounts.models import VALUED_TYPES, Account, Loan

from .models import Transaction

ADJUSTMENT_PAYEE = "Value adjustment"


class AdjustmentError(Exception):
    """The account's value can't be set (wrong type or archived)."""


def recompute_adjustments(account_id):
    """Set every adjustment's amount in the account so the balance at the
    end of its date is its value. Writes with update() so it triggers no
    signals of its own."""
    adjustments = list(
        Transaction.objects.filter(account_id=account_id, is_adjustment=True).order_by("date", "id")
    )
    if not adjustments:
        return
    account = Account.objects.get(pk=account_id)
    others = Transaction.objects.ledger_rows().filter(account_id=account_id, is_adjustment=False)
    balance = account.starting_balance_cents
    previous_date = None
    for adjustment in adjustments:
        # Rows dated on the adjustment's day count as before it.
        since = others.filter(date__lte=adjustment.date)
        if previous_date is not None:
            since = since.filter(date__gt=previous_date)
        balance += since.aggregate(total=Sum("amount_cents"))["total"] or 0
        amount = adjustment.adjustment_value_cents - balance
        if amount != adjustment.amount_cents:
            Transaction.objects.filter(pk=adjustment.pk).update(amount_cents=amount)
        balance = adjustment.adjustment_value_cents
        previous_date = adjustment.date


@db_transaction.atomic
def set_value(account, date, value_cents):
    """Record that `account` is worth `value_cents` at the end of `date`,
    replacing any adjustment on that date. Returns the adjustment."""
    if account.account_type not in VALUED_TYPES:
        raise AdjustmentError("Only investment, property and loan accounts have a value to set.")
    if account.archived:
        raise AdjustmentError("An archived account's value can't be set.")
    # A value set by hand would be overwritten by the next installment.
    if Loan.objects.filter(account=account).exists():
        raise AdjustmentError("This loan follows its schedule. Change the loan's terms instead.")
    Transaction.objects.filter(account=account, is_adjustment=True, date=date).delete()
    adjustment = Transaction.objects.create(
        account=account,
        date=date,
        amount_cents=0,
        payee=ADJUSTMENT_PAYEE,
        is_adjustment=True,
        adjustment_value_cents=value_cents,
    )
    recompute_adjustments(account.pk)
    adjustment.refresh_from_db()
    return adjustment


def recompute_if_valued(account_id):
    """recompute_adjustments, for an account that has any."""
    if Transaction.objects.filter(account_id=account_id, is_adjustment=True).exists():
        recompute_adjustments(account_id)


@receiver(post_save, sender=Transaction)
@receiver(post_delete, sender=Transaction)
def _transaction_changed(sender, instance, raw=False, **kwargs):
    # A restore saves rows as they were (raw), adjustments included.
    if raw:
        return
    # Deleting an account cascades to its rows; there is nothing left to
    # recompute then.
    if Account.objects.filter(pk=instance.account_id).exists():
        recompute_if_valued(instance.account_id)


@receiver(post_save, sender=Account)
def _account_changed(sender, instance, created, raw=False, **kwargs):
    if not created and not raw:
        recompute_if_valued(instance.pk)

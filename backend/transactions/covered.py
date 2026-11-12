"""Covered entries: something a tab's person paid for the user, outside the
user's accounts - see openspec/specs/repayment-tabs.

An entry is two rows in the household's off-bank account, on one date and
payee: the cost (-amount, a normal category), which reports and budgets
count as spending, and the tab half (+amount, the tab), which lowers what
the person owes. The cost points at the tab half through covered_tab_row.
The two always net to zero, so the off-bank account's balance stays 0.
Every write to a pair goes through this module.
"""

from dataclasses import dataclass

from django.db import transaction as db_transaction

from accounts.models import Account
from budgets.models import Category

from .models import Transaction

OFF_BANK_NAME = "Paid by others"


class CoveredError(Exception):
    def __init__(self, field, message):
        super().__init__(message)
        self.field = field
        self.message = message


@dataclass
class CoveredInput:
    date: object
    payee: str
    amount_cents: int
    category: Category
    notes: str = ""


def off_bank_account():
    """The household's off-bank account, created on first use."""
    account, _ = Account.objects.get_or_create(
        is_off_bank=True,
        defaults={"name": OFF_BANK_NAME, "account_type": Account.AccountType.OTHER, "starting_balance_cents": 0},
    )
    return account


def _validate(data):
    if not isinstance(data.amount_cents, int) or isinstance(data.amount_cents, bool) or data.amount_cents <= 0:
        raise CoveredError("amount_cents", "Enter an amount above zero.")
    if not (data.payee or "").strip():
        raise CoveredError("payee", "Say what it was for.")
    if data.category is None:
        raise CoveredError("category", "Pick a category.")
    if data.category.is_tab_group or data.category.is_tab:
        raise CoveredError("category", "A covered entry's category can't be a tab.")


def _fields(data):
    return {
        "date": data.date,
        "payee": data.payee.strip(),
        "notes": data.notes or "",
        "category_confirmed": True,
        "category_source": Transaction.CategorySource.MANUAL,
        "category_reason": "",
    }


def covered_rows(tab):
    """The tab halves of the covered entries on `tab`."""
    return Transaction.objects.filter(category=tab, covered_cost__isnull=False)


@db_transaction.atomic
def create(tab, data):
    """Record a covered entry on `tab`; returns its tab half."""
    _validate(data)
    account = off_bank_account()
    fields = _fields(data)
    tab_row = Transaction.objects.create(account=account, amount_cents=data.amount_cents, category=tab, **fields)
    Transaction.objects.create(
        account=account, amount_cents=-data.amount_cents, category=data.category, covered_tab_row=tab_row, **fields
    )
    return tab_row


@db_transaction.atomic
def update(tab_row, data):
    """Change both halves of the entry whose tab half is `tab_row`."""
    _validate(data)
    cost = tab_row.covered_cost
    fields = _fields(data)
    for row, amount, category in ((tab_row, data.amount_cents, tab_row.category), (cost, -data.amount_cents, data.category)):
        for name, value in fields.items():
            setattr(row, name, value)
        row.amount_cents = amount
        row.category = category
        row.save()
    return tab_row


@db_transaction.atomic
def delete(tab_row):
    """Remove both halves; the cost goes with its tab half."""
    tab_row.delete()

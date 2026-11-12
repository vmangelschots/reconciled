"""Expected items: which categories and accounts one may use, and whether it
has come this month - see openspec/specs/forecasting.

An expected item stands for money nothing else forecasts. A category that
has a budget (or sits under one), a loan's payment category and an account
of the pot are already forecast, so an item may not use them: nothing is
counted twice.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta

from accounts.models import Account, tier_position
from budgets.loan_categories import loan_categories
from budgets.models import Category, CategoryLimit
from budgets.summary import budgeted_categories
from budgets.utils import month_range
from reports.balances import history_tier
from transactions.models import Transaction

from .models import ExpectedItem

# A transaction within this share of an item's amount counts as the item.
RECOGNITION_SHARE = 25

BUDGET_KINDS = {Category.BudgetKind.YEARLY, Category.BudgetKind.TARGET, Category.BudgetKind.BILLS}


def blocked_category_ids():
    """Ids of the categories an expected item may not use: one with a budget
    of any kind (a monthly limit, a yearly kind, bills), one under such a
    parent, a loan's payment category, and tabs and tab groups."""
    limited = set(CategoryLimit.objects.values_list("category_id", flat=True))
    loans = loan_categories()
    rows = list(Category.objects.values_list("id", "parent_id", "budget_kind", "is_tab_group"))
    covering = {
        cid for cid, _, kind, tab in rows if kind in BUDGET_KINDS or cid in limited or cid in loans or tab
    }
    return covering | {cid for cid, parent, _, _ in rows if parent in covering}


def pot_tier():
    """The tier the forecast covers: Everyday, or the only one in use."""
    return history_tier()


def allowed_categories():
    blocked = blocked_category_ids()
    return [c for c in budgeted_categories().select_related("parent") if c.id not in blocked]


def allowed_accounts():
    """Active accounts outside the pot, in the usual order."""
    tier = pot_tier()
    return [a for a in Account.objects.visible().filter(archived=False).order_by(tier_position(), "name", "id") if a.tier != tier]


def due_date(month, day):
    last = calendar.monthrange(month.year, month.month)[1]
    return month.replace(day=min(day, last))


def next_month(month):
    return month_range(month)


def within(cents, amount_cents):
    return abs(abs(cents) - amount_cents) * 100 <= amount_cents * RECOGNITION_SHARE


def _category_family(category_id):
    return {category_id, *Category.objects.filter(parent_id=category_id).values_list("id", flat=True)}


def received_on(item, month):
    """The date this month's money for `item` came, or None. A transaction
    goes its way when it is in its category (a subcategory, or an AI guess
    not yet confirmed, counts too) or is a transfer to its account for an out
    item and from it for an in item, within 25% of its amount. The closest
    amount wins, then the earliest."""
    rows = Transaction.objects.counted_rows().excluding_adjustments().filter(
        date__gte=month, date__lt=month_range(month)
    )
    incoming = item.direction == ExpectedItem.Direction.IN
    if item.category_id is not None:
        rows = rows.filter(category_id__in=_category_family(item.category_id))
        rows = rows.filter(amount_cents__gt=0) if incoming else rows.filter(amount_cents__lt=0)
    elif item.account_id is not None:
        # Seen from the other account: money arriving there left the pot.
        rows = rows.filter(account_id=item.account_id, transfer_counterpart__isnull=False)
        rows = rows.filter(amount_cents__lt=0) if incoming else rows.filter(amount_cents__gt=0)
    else:
        return None
    candidates = [(abs(abs(cents) - item.amount_cents), day) for day, cents in rows.values_list("date", "amount_cents") if within(cents, item.amount_cents)]
    return min(candidates)[1] if candidates else None


@dataclass(frozen=True)
class MonthStatus:
    """Where an expected item stands as of today. `status` is received,
    next, late, unrecognisable or budgeted (already forecast another way)."""

    status: str
    received_on: date | None
    # The first day it is forecast on, None when it isn't (budgeted).
    next_on: date | None


def month_status(item, today, blocked=None, tier=None):
    blocked = blocked_category_ids() if blocked is None else blocked
    tier = pot_tier() if tier is None else tier
    month = today.replace(day=1)
    following = due_date(next_month(month), item.day)
    if item.category_id in blocked or (item.account_id is not None and item.account.tier == tier):
        return MonthStatus("budgeted", None, None)
    due = due_date(month, item.day)
    # Without a category or account (both deleted since) it can't be
    # recognised: it stays expected, and the Expected panel asks for one.
    unrecognisable = item.category_id is None and item.account_id is None
    came = None if unrecognisable else received_on(item, month)
    if came is not None:
        return MonthStatus("received", came, following)
    if due > today:
        return MonthStatus("unrecognisable" if unrecognisable else "next", None, due)
    tomorrow = _tomorrow_in_month(today)
    if tomorrow is not None:
        return MonthStatus("unrecognisable" if unrecognisable else "late", None, tomorrow)
    # It never came this month: next month's is expected, once.
    return MonthStatus("unrecognisable" if unrecognisable else "next", None, following)


def _tomorrow_in_month(today):
    tomorrow = today + timedelta(days=1)
    return tomorrow if tomorrow.month == today.month else None


def validation_errors(category, account):
    """{field: message} for a category or account an item may not use."""
    if (category is None) == (account is None):
        return {"category": "Choose a category or an account to recognise it by."}
    if category is not None:
        if category.id in blocked_category_ids():
            return {"category": "This category's budget is already in the forecast."}
        return {}
    if account.archived or account.is_off_bank:
        return {"account": "Choose an active account."}
    if account.tier == pot_tier():
        return {"account": "Money moving between these accounts doesn't change the forecast."}
    return {}


"""Tab balances: what someone owes the user, from the rows in a tab.

A tab is a subcategory of a tab group (budgets/tabs.py). Its rows are the
transactions and split parts with that category; money out raises what
is owed and money in lowers it, so the balance is the negated sum. No
repayment is matched to the item it repays - see
openspec/specs/repayment-tabs.
"""

from dataclasses import dataclass, field
from datetime import date

from budgets.models import Category

from .models import Transaction


@dataclass
class TabSummary:
    category: Category
    balance_cents: int = 0
    # The date of the first row after the balance was last zero; None
    # while the tab is settled.
    open_since: date | None = None
    rows: list = field(default_factory=list)  # [(Transaction, running_balance_cents)]


def tabs():
    """Every tab, with its group, in name order."""
    return Category.objects.filter(parent__is_tab_group=True).select_related("parent").order_by("name", "id")


def tab_rows(categories):
    """The rows of `categories`, oldest first. Counted rows only, so a
    split transaction never counts next to its parts."""
    return (
        Transaction.objects.counted_rows()
        .filter(category__in=categories)
        .select_related("split_parent")
        .order_by("date", "id")
    )


def summarize(category, rows):
    """Walk `rows` (oldest first) once for the balance, each row's running
    balance and the open-since date."""
    summary = TabSummary(category)
    opened = None
    for row in rows:
        if summary.balance_cents == 0:
            opened = row.date
        summary.balance_cents -= row.amount_cents
        summary.rows.append((row, summary.balance_cents))
    summary.open_since = opened if summary.balance_cents != 0 else None
    return summary


def balances():
    """A TabSummary per tab, largest balance (either way) first, from one
    query over all tab rows."""
    categories = list(tabs())
    rows_by_tab = {c.id: [] for c in categories}
    for row in tab_rows(categories):
        rows_by_tab[row.category_id].append(row)
    summaries = [summarize(c, rows_by_tab[c.id]) for c in categories]
    summaries.sort(key=lambda s: -abs(s.balance_cents))
    return summaries


def tab_detail(category):
    """The TabSummary of one tab, with its rows."""
    return summarize(category, tab_rows([category]))

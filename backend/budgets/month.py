"""A month's budget, as the Budgets page shows it and the MCP get_budget
tool returns it - one function so the two can't disagree."""

from reports.spending import month_spending

from . import utils
from .attention import attention_bills, attention_categories, attention_yearly
from .summary import budget_rows, budget_totals, uncategorized_spent, yearly_spent_cents
from .yearly import yearly_rows


def month_budget(period_start, today):
    """Callers bring loan matches up to date first (sync_loans): loan bills
    are paid when their installment is matched."""
    current = period_start == today.replace(day=1)
    days_in_month = (utils.month_range(period_start) - period_start).days
    pace = today.day / days_in_month if current else None
    rows = budget_rows(period_start, today)
    yearly = yearly_rows(period_start, today)
    yearly_spent = yearly_spent_cents(period_start)
    _, uncategorized_cents = month_spending(period_start)
    return {
        "categories": rows,
        "uncategorized_spent_cents": uncategorized_spent(period_start),
        "yearly_spent_cents": yearly_spent,
        "yearly": yearly,
        # The same figures and warnings as the overview's budget tile.
        "totals": {
            **budget_totals(rows, pace),
            "yearly_spent_cents": yearly_spent,
            "uncategorized_cents": uncategorized_cents,
        },
        "pace": pace,
        "days_left": days_in_month - today.day + 1 if current else None,
        "attention": {
            "categories": attention_categories(rows, pace),
            "yearly": attention_yearly(yearly, current),
            "bills": attention_bills(rows),
        },
    }

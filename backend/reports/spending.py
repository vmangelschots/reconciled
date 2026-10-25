"""A month's spending per category, shared by the category spending
report and the overview."""

from django.db.models import Sum

from budgets.utils import month_range
from transactions.models import Transaction


def active_transactions():
    # Transfers between the user's own accounts are neither income nor
    # spending, so no report counts them (they never have a category), and
    # neither are tab rows: money lent out or paid back, or value
    # adjustments. A split transaction counts through its parts.
    return (
        Transaction.objects.counted_rows()
        .outside_tabs()
        .excluding_adjustments()
        .filter(account__archived=False, transfer_counterpart__isnull=True)
    )


def month_spending(month):
    """({category_id: net outflow}, uncategorized outflows) for the month
    starting at `month`, in active accounts. Refunds reduce a category's
    spending; uncategorized spending counts outflows only, since
    uncategorized inflows are usually income."""
    in_month = active_transactions().filter(date__gte=month, date__lt=month_range(month))
    spent = {
        row["category_id"]: -row["net"]
        for row in in_month.filter(category__isnull=False).values("category_id").annotate(net=Sum("amount_cents"))
    }
    uncategorized = -(
        in_month.filter(category__isnull=True, amount_cents__lt=0).aggregate(total=Sum("amount_cents"))["total"] or 0
    )
    return spent, uncategorized

"""A month's budget figures per category, shared by the Budgets page and
the overview so the two can't disagree."""

from django.db.models import Q, Sum

from transactions.models import Transaction

from .models import Category, CategoryLimit
from .utils import month_range


def budgeted_categories():
    """Every category except tab groups and tabs, which aren't budgeted -
    see openspec/specs/repayment-tabs."""
    return Category.objects.filter(is_tab_group=False).exclude(parent__is_tab_group=True)


def budget_rows(period_start):
    """One row per monthly budgeted category for the month starting at
    `period_start`: its limit (the month's override, else the default,
    else None) and its spending, the net outflow of its transactions.
    Two grouped queries instead of one pair per category."""
    period_end = month_range(period_start)
    # Yearly categories have their own figures - see budgets/yearly.py.
    categories = list(budgeted_categories().filter(budget_kind=Category.BudgetKind.MONTHLY))

    spent = {
        row["category_id"]: -row["total"]
        for row in Transaction.objects.filter(
            category__in=categories, date__gte=period_start, date__lt=period_end
        )
        .values("category_id")
        .annotate(total=Sum("amount_cents"))
    }
    defaults, overrides = {}, {}
    limits = CategoryLimit.objects.filter(category__in=categories).filter(
        Q(month__isnull=True) | Q(month=period_start)
    )
    for limit in limits:
        if limit.month is None:
            defaults[limit.category_id] = limit.limit_cents
        elif limit.month == period_start:
            overrides[limit.category_id] = limit.limit_cents

    rows = []
    for category in categories:
        limit_cents = overrides.get(category.id, defaults.get(category.id))
        spent_cents = spent.get(category.id, 0)
        rows.append(
            {
                "category_id": category.id,
                "category_name": category.name,
                "parent_id": category.parent_id,
                "limit_cents": limit_cents,
                "spent_cents": spent_cents,
                "remaining_cents": limit_cents - spent_cents if limit_cents is not None else None,
                "over_limit": limit_cents is not None and spent_cents > limit_cents,
            }
        )
    return rows


def uncategorized_spent(period_start):
    """The month's net uncategorized amount as spending: transfers and
    split transactions themselves left out (a split counts through its
    parts)."""
    total = (
        Transaction.objects.counted_rows()
        .filter(
            category__isnull=True,
            transfer_counterpart__isnull=True,
            date__gte=period_start,
            date__lt=month_range(period_start),
        )
        .aggregate(total=Sum("amount_cents"))["total"]
        or 0
    )
    return -total

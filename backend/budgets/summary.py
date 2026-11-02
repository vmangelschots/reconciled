"""A month's budget figures per category, shared by the Budgets page and
the overview so the two can't disagree."""

from django.db.models import Q, Sum

from transactions.models import Transaction

from .models import Category, CategoryLimit
from .utils import month_range


YEARLY_KINDS = [Category.BudgetKind.YEARLY, Category.BudgetKind.TARGET]


def budgeted_categories():
    """Every category except tab groups and tabs, which aren't budgeted -
    see openspec/specs/repayment-tabs."""
    return Category.objects.filter(is_tab_group=False).exclude(parent__is_tab_group=True)


def spent_by_category(categories, start, end):
    """{category_id: net outflow} in [start, end)."""
    return {
        row["category_id"]: -row["total"]
        for row in Transaction.objects.filter(category__in=categories, date__gte=start, date__lt=end)
        .values("category_id")
        .annotate(total=Sum("amount_cents"))
    }


def monthly_limits(period_start):
    """({category_id: limit}, ids with an override) for the month: its
    override, else the default. A category without either isn't in it."""
    defaults, overrides = {}, {}
    limits = CategoryLimit.objects.filter(category__in=budgeted_categories(), category__budget_kind=Category.BudgetKind.MONTHLY).filter(
        Q(month__isnull=True) | Q(month=period_start)
    )
    for limit in limits:
        if limit.month is None:
            defaults[limit.category_id] = limit.limit_cents
        else:
            overrides[limit.category_id] = limit.limit_cents
    return {**defaults, **overrides}, set(overrides)


def has_budget(category, limits):
    """Whether `category` has a budget that covers what's under it: a
    limit for the month, or a yearly kind whatever its figures that year."""
    return category.budget_kind in YEARLY_KINDS or category.id in limits


def subcategories_by_parent(categories):
    children = {}
    for category in categories:
        if category.parent_id is not None:
            children.setdefault(category.parent_id, []).append(category)
    return children


def budget_rows(period_start):
    """One row per monthly budgeted category for the month starting at
    `period_start`: its limit and its spending, the net outflow of its
    transactions. A parent with a limit counts everything under it; a
    subcategory's own limit is a cap inside its parent - see
    openspec/specs/budgets."""
    categories = list(budgeted_categories().select_related("parent"))
    spent = spent_by_category(categories, period_start, month_range(period_start))
    limits, overridden = monthly_limits(period_start)
    children = subcategories_by_parent(categories)

    rows = []
    # Yearly categories have their own rows - see budgets/yearly.py.
    for category in (c for c in categories if c.budget_kind == Category.BudgetKind.MONTHLY):
        limit_cents = limits.get(category.id)
        subcategories = children.get(category.id, [])
        covers = limit_cents is not None and bool(subcategories)
        own_cents = spent.get(category.id, 0)
        under_cents = own_cents + sum(spent.get(sub.id, 0) for sub in subcategories)
        spent_cents = under_cents if covers else own_cents
        rows.append(
            {
                "category_id": category.id,
                "category_name": category.name,
                "parent_id": category.parent_id,
                "limit_cents": limit_cents,
                "spent_cents": spent_cents,
                "remaining_cents": limit_cents - spent_cents if limit_cents is not None else None,
                "over_limit": limit_cents is not None and spent_cents > limit_cents,
                "covers_subcategories": covers,
                "covered_by_parent": category.parent is not None and has_budget(category.parent, limits),
                "caps_cents": sum(limits.get(sub.id, 0) for sub in subcategories) if covers else None,
                # What a parent without a budget shows: everything under it.
                "group_spent_cents": under_cents if subcategories and limit_cents is None else None,
                "overridden": category.id in overridden,
            }
        )
    return rows


def budget_totals(rows):
    """The month's totals from `budget_rows`, shared so pages can't
    disagree. Covered rows are left out: their spending is already in the
    parent, and a cap adds nothing to the budget."""
    counted = [r for r in rows if not r["covered_by_parent"]]
    limited = [r for r in counted if r["limit_cents"] is not None]
    return {
        "has_limits": bool(limited),
        "limit_cents": sum(r["limit_cents"] for r in limited),
        "spent_cents": sum(r["spent_cents"] for r in limited),
        "outside_cents": sum(r["spent_cents"] for r in counted if r["limit_cents"] is None and r["spent_cents"] > 0),
    }


def yearly_spent_cents(month):
    """The month's spending covered by a yearly or yearly-on-a-date
    budget. Spending belongs to the parent when it has a budget, so a
    yearly subcategory under a monthly limit isn't counted here."""
    categories = list(budgeted_categories().select_related("parent"))
    spent = spent_by_category(categories, month, month_range(month))
    limits, _ = monthly_limits(month)

    def owner(category):
        return category.parent if category.parent is not None and has_budget(category.parent, limits) else category

    return sum(spent.get(c.id, 0) for c in categories if owner(c).budget_kind in YEARLY_KINDS)


def uncategorized_spent(period_start):
    """The month's net uncategorized amount as spending: transfers, value
    adjustments and split transactions themselves left out (a split counts
    through its parts)."""
    total = (
        Transaction.objects.counted_rows()
        .excluding_adjustments()
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

"""A month's budget figures per category, shared by the Budgets page and
the overview so the two can't disagree."""

from django.db.models import Q, Sum

from transactions.models import Transaction

from . import utils
from .bills import bill_rows
from .loan_bills import loan_lines as month_loan_lines
from .models import Bill, Category, CategoryLimit
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


def monthly_limits(period_start, loan_lines=None):
    """({category_id: limit}, ids with an override) for the month: its
    override, else the default. A category without either isn't in it. A
    Bills category's limit is the total of its bills that count in the
    month, so it is a budget like any limit - see openspec/specs/bill-budgets.
    A loan category's bills come from its loans (`loan_lines`, worked out
    here when not given)."""
    defaults, overrides = {}, {}
    limits = CategoryLimit.objects.filter(category__in=budgeted_categories(), category__budget_kind=Category.BudgetKind.MONTHLY).filter(
        Q(month__isnull=True) | Q(month=period_start)
    )
    for limit in limits:
        if limit.month is None:
            defaults[limit.category_id] = limit.limit_cents
        else:
            overrides[limit.category_id] = limit.limit_cents
    bills = (
        Bill.objects.filter(
            category__in=budgeted_categories(), category__budget_kind=Category.BudgetKind.BILLS, from_month__lte=period_start
        )
        .values("category_id")
        .annotate(total=Sum("amount_cents"))
    )
    bill_totals = {row["category_id"]: row["total"] for row in bills}
    if loan_lines is None:
        loan_lines = month_loan_lines(period_start, utils.today())
    for category_id, lines in loan_lines.items():
        bill_totals[category_id] = bill_totals.get(category_id, 0) + sum(line["amount_cents"] for line in lines)
    return {**defaults, **overrides, **bill_totals}, set(overrides)


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


MONTHLY_KINDS = [Category.BudgetKind.MONTHLY, Category.BudgetKind.BILLS]


def budget_rows(period_start, today=None):
    """One row per monthly or Bills category for the month starting at
    `period_start`: its limit and its spending, the net outflow of its
    transactions. A parent with a limit counts everything under it; a
    subcategory's own limit is a cap inside its parent - see
    openspec/specs/budgets. A Bills row's limit is its bills' total, and it
    also carries each bill's state as of `today` - see
    openspec/specs/bill-budgets."""
    today = today or utils.today()
    categories = list(budgeted_categories().select_related("parent").prefetch_related("bills"))
    spent = spent_by_category(categories, period_start, month_range(period_start))
    loans = month_loan_lines(period_start, today)
    limits, overridden = monthly_limits(period_start, loans)
    children = subcategories_by_parent(categories)
    bills = bill_rows(
        [c for c in categories if c.budget_kind == Category.BudgetKind.BILLS], children, period_start, today, loans
    )

    rows = []
    # Yearly categories have their own rows - see budgets/yearly.py.
    for category in (c for c in categories if c.budget_kind in MONTHLY_KINDS):
        limit_cents = limits.get(category.id)
        subcategories = children.get(category.id, [])
        covers = limit_cents is not None and bool(subcategories)
        own_cents = spent.get(category.id, 0)
        under_cents = own_cents + sum(spent.get(sub.id, 0) for sub in subcategories)
        spent_cents = under_cents if covers else own_cents
        row = {
            "category_id": category.id,
            "category_name": category.name,
            "parent_id": category.parent_id,
            "kind": category.budget_kind,
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
        if category.budget_kind == Category.BudgetKind.BILLS:
            figures = bills.get(category.id)
            row.update(
                bills=figures["bills"] if figures else [],
                paid_count=figures["paid_count"] if figures else 0,
                due_to_date_cents=figures["due_to_date_cents"] if figures else 0,
                unpaid_cents=figures["unpaid_cents"] if figures else 0,
            )
        rows.append(row)
    return rows


def budget_totals(rows, pace=None):
    """The month's totals from `budget_rows`, shared so pages can't
    disagree. Covered rows are left out: their spending is already in the
    parent, and a cap adds nothing to the budget.

    For the current month (`pace` set), `marker` is where spending is
    expected to be by the end of today, as a share of the limits: the bills
    due so far plus the passed share of every other limit. Without bills it
    equals `pace`. `bills_unpaid_cents` is what the bills still need, which
    the per-day figure leaves out - see openspec/specs/overview."""
    counted = [r for r in rows if not r["covered_by_parent"]]
    limited = [r for r in counted if r["limit_cents"] is not None]
    limit_cents = sum(r["limit_cents"] for r in limited)
    bills = [r for r in limited if r["kind"] == Category.BudgetKind.BILLS]
    marker = None
    if pace is not None:
        bills_cents = sum(r["limit_cents"] for r in bills)
        due_cents = sum(r["due_to_date_cents"] for r in bills)
        marker = (due_cents + pace * (limit_cents - bills_cents)) / limit_cents if limit_cents > 0 else pace
    return {
        "has_limits": bool(limited),
        "limit_cents": limit_cents,
        "spent_cents": sum(r["spent_cents"] for r in limited),
        "outside_cents": sum(r["spent_cents"] for r in counted if r["limit_cents"] is None and r["spent_cents"] > 0),
        "marker": marker,
        "bills_unpaid_cents": sum(r["unpaid_cents"] for r in bills) if pace is not None else None,
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

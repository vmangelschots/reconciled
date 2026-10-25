"""Yearly and yearly-on-a-date budgets - see openspec/specs/yearly-budgets.

The date arithmetic is plain functions of dates and cents, so it can be
tested without the database.
"""

from datetime import date, timedelta

from django.db.models import Sum

from transactions.models import Transaction

from .models import BudgetSettings, Category
from .summary import budgeted_categories
from .utils import month_range

YEARLY_KINDS = [Category.BudgetKind.YEARLY, Category.BudgetKind.TARGET]

# A target this many days or fewer before its due date is due soon.
DUE_SOON_DAYS = 14
# Days after the due date before an unpaid target counts as overdue, to
# allow for bank exports landing a few days late.
GRACE_DAYS = 7
# A yearly budget this far into its budget is a warning once it is also
# ahead of the year's pace - the same share as monthly category warnings.
WARNING_SHARE = 85


def values_for_year(rows, year):
    """The YearlyBudget row that applies to `year`: the one with the
    largest from_year <= year, else the oldest, so a budget covers whole
    years whenever it was added. None when there are no rows."""
    rows = list(rows)
    if not rows:
        return None
    earlier = [r for r in rows if r.from_year <= year]
    if earlier:
        return max(earlier, key=lambda r: r.from_year)
    return min(rows, key=lambda r: r.from_year)


def budgeted_period(year, start_month):
    """(first day, last day) of the part of `year` that is budgeted, or
    None for a year before the start month's year."""
    if start_month is not None and year < start_month.year:
        return None
    first = start_month if start_month is not None and start_month.year == year else date(year, 1, 1)
    return first, date(year, 12, 31)


def prorated_cents(amount_cents, year, start_month):
    """The yearly amount for `year`: in the start month's year, the share
    of the months from the start month through December (the start month
    included), rounded down to the cent."""
    if start_month is not None and start_month.year == year:
        return amount_cents * (13 - start_month.month) // 12
    return amount_cents


def target_counts(due, start_month):
    """Whether a target due on `due` is expected at all: not before the
    start month, which also rules out every earlier year."""
    return start_month is None or due >= start_month


def reference_day(month, today):
    """The day figures are given as of: today for the current month,
    otherwise the month's last day."""
    if month == today.replace(day=1):
        return today
    return month_range(month) - timedelta(days=1)


def pace(period, today):
    """Share of the budgeted period passed by the end of today."""
    first, last = period
    total = (last - first).days + 1
    passed = min(max((today - first).days + 1, 0), total)
    return passed / total


def runway_cents(left_cents, today):
    """What's left per remaining month of the year, the current month
    included, rounded down to whole euros."""
    months = 13 - today.month
    return left_cents // months // 100 * 100


def tolerance_cents(amount_cents):
    """How far off its amount a target may be paid and still count as
    paid: the larger of 5% and 10.00."""
    return max(amount_cents * 5 // 100, 1000)


def target_state(spent_cents, amount_cents, due, ref_day):
    """One of paid_over, paid, due_soon, upcoming, not_seen, overdue or
    partly_paid, as of `ref_day`. Paid needs some spending, so a small
    target isn't paid by its tolerance alone."""
    tolerance = tolerance_cents(amount_cents)
    if spent_cents > amount_cents + tolerance:
        return "paid_over"
    if spent_cents > 0 and spent_cents >= amount_cents - tolerance:
        return "paid"
    if ref_day <= due:
        return "due_soon" if (due - ref_day).days <= DUE_SOON_DAYS else "upcoming"
    if (ref_day - due).days <= GRACE_DAYS:
        return "not_seen"
    return "overdue" if spent_cents <= 0 else "partly_paid"


def is_ahead(spent_cents, budget_cents, pace_share):
    """At WARNING_SHARE% or more of the budget and ahead of the pace
    share; shares are rounded down."""
    if pace_share is None or budget_cents <= 0:
        return False
    share = spent_cents * 100 // budget_cents
    return spent_cents <= budget_cents and share >= WARNING_SHARE and share > pace_share * 100


def _spent_by_category(categories, start, end):
    """{category_id: net outflow} in [start, end), counted the way
    budget_rows counts a month."""
    return {
        row["category_id"]: -row["total"]
        for row in Transaction.objects.filter(category__in=categories, date__gte=start, date__lt=end)
        .values("category_id")
        .annotate(total=Sum("amount_cents"))
    }


def yearly_spent_cents(month):
    """The month's spending in yearly and yearly-on-a-date categories."""
    categories = budgeted_categories().filter(budget_kind__in=YEARLY_KINDS)
    return sum(_spent_by_category(categories, month, month_range(month)).values())


def yearly_rows(month, today):
    """The "This year" figures for the year of `month`, as of the end of
    that month (today for the current month).

    Returns {year, through, start_month, starts, categories}. `starts` is
    the start month, with no categories, when `month` is before it.
    """
    start = BudgetSettings.load().start_month
    result = {
        "year": month.year,
        "through": reference_day(month, today),
        "start_month": start,
        "starts": None,
        "categories": [],
    }
    if start is not None and month < start:
        result["starts"] = start
        return result

    year = month.year
    period = budgeted_period(year, start)
    current = month == today.replace(day=1)
    pace_share = pace(period, today) if current else None
    ref_day = result["through"]
    categories = list(budgeted_categories().filter(budget_kind__in=YEARLY_KINDS).prefetch_related("yearly_budgets"))
    spent = _spent_by_category(categories, period[0], month_range(month))

    for category in categories:
        values = values_for_year(category.yearly_budgets.all(), year)
        if values is None:
            continue
        spent_cents = spent.get(category.id, 0)
        row = {
            "category_id": category.id,
            "category_name": category.name,
            "parent_id": category.parent_id,
            "kind": category.budget_kind,
            "amount_cents": values.amount_cents,
            "spent_cents": spent_cents,
        }
        if category.budget_kind == Category.BudgetKind.TARGET:
            due = date(year, values.due_month, values.due_day)
            if not target_counts(due, start):
                continue
            state = target_state(spent_cents, values.amount_cents, due, ref_day)
            row.update(
                budget_cents=values.amount_cents,
                prorated_from=None,
                due_date=due,
                state=state,
                difference_cents=spent_cents - values.amount_cents,
                over=state == "paid_over",
                ahead=False,
                pace=None,
                runway_cents=None,
            )
        else:
            budget_cents = prorated_cents(values.amount_cents, year, start)
            left = budget_cents - spent_cents
            row.update(
                budget_cents=budget_cents,
                prorated_from=start if budget_cents != values.amount_cents else None,
                due_date=None,
                state=None,
                difference_cents=None,
                over=spent_cents > budget_cents,
                ahead=is_ahead(spent_cents, budget_cents, pace_share),
                pace=pace_share,
                runway_cents=runway_cents(left, today) if current and left > 0 else None,
            )
        row["remaining_cents"] = row["budget_cents"] - spent_cents
        result["categories"].append(row)
    return result

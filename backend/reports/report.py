"""The Reports page's figures: a profit and loss over a period of whole
months, per month per category. One rule behind the table, the chart
and the sheet of rows behind a cell - see openspec/specs/spending-report."""

from django.db.models import BigIntegerField, Case, Min, Sum, When
from django.db.models.functions import TruncMonth

from budgets.models import Category
from budgets.utils import month_range

from .spending import counted_transactions

# A first month that starts after this day isn't a full month of data.
FULL_MONTH_LATEST_START = 5
MIN_FULL_MONTHS = 2


def shift_months(month, delta):
    index = month.year * 12 + (month.month - 1) + delta
    return month.replace(year=index // 12, month=index % 12 + 1)


def months_in(start, end):
    months = []
    month = start
    while month <= end:
        months.append(month)
        month = shift_months(month, 1)
    return months


def _figures(cents, full):
    """A row's cells: its months in period order, total and average per
    full month. `full` holds the indexes of the full months."""
    return {
        "cents": cents,
        "total_cents": sum(cents),
        "avg_cents": round(sum(cents[i] for i in full) / len(full)) if len(full) >= MIN_FULL_MONTHS else None,
    }


def _rate(net, income):
    return round(net * 100 / income) if income > 0 else None


def _category_rows(months, spent, full):
    """Parents with their subcategories rolled in, largest total first.
    `spent` is {(category id, month): net outflow}."""
    categories = list(Category.objects.all())
    subcategories = {}
    for category in categories:
        if category.parent_id is not None:
            subcategories.setdefault(category.parent_id, []).append(category)

    def cells(category):
        return [spent.get((category.id, m), 0) for m in months]

    rows = []
    for parent in (c for c in categories if c.parent_id is None):
        direct = cells(parent)
        children = [
            {"category_id": c.id, "name": c.name, "direct": False, **_figures(cells(c), full)}
            for c in subcategories.get(parent.id, [])
            if any(cells(c))
        ]
        all_subs = [cells(c) for c in subcategories.get(parent.id, [])]
        total = [direct[i] + sum(sub[i] for sub in all_subs) for i in range(len(months))]
        if not any(total):
            continue
        if children and any(direct):
            children.append(
                {"category_id": parent.id, "name": f"{parent.name} (direct)", "direct": True, **_figures(direct, full)}
            )
        children.sort(key=lambda c: -c["total_cents"])
        rows.append({"category_id": parent.id, "name": parent.name, "children": children, **_figures(total, full)})
    rows.sort(key=lambda r: -r["total_cents"])
    return rows


def _as_income(row, full):
    """A category row with money in as positive."""
    flipped = {
        **row,
        **_figures([-c for c in row["cents"]], full),
        "children": [{**c, **_figures([-x for x in c["cents"]], full)} for c in row.get("children", [])],
    }
    flipped["children"].sort(key=lambda c: -c["total_cents"])
    return flipped


def spending_report(start, end, today):
    """The report for the months from `start` to `end`, clipped to the
    first transaction. A month is full unless it is the current month, or
    the first month of data when that starts after FULL_MONTH_LATEST_START."""
    current = today.replace(day=1)
    counted = counted_transactions(include_archived=True)
    first = counted.aggregate(first=Min("date"))["first"]
    months = months_in(max(start, first.replace(day=1)), end) if first else []
    report = {
        "has_data": first is not None,
        "current_month": current.strftime("%Y-%m"),
        "months": [m.strftime("%Y-%m") for m in months],
    }
    if not months:
        return report

    full = [
        i
        for i, m in enumerate(months)
        if m != current and not (m == first.replace(day=1) and first.day > FULL_MONTH_LATEST_START)
    ]
    in_period = counted.filter(date__gte=months[0], date__lt=month_range(months[-1])).annotate(
        month=TruncMonth("date")
    )
    spent = {
        (row["category_id"], row["month"]): -row["net"]
        for row in in_period.filter(category__isnull=False).values("category_id", "month").annotate(net=Sum("amount_cents"))
    }
    loose_out, loose_in = (
        dict(
            in_period.filter(category__isnull=True, **direction)
            .values("month")
            .annotate(total=Sum("amount_cents"))
            .values_list("month", "total")
        )
        for direction in ({"amount_cents__lt": 0}, {"amount_cents__gt": 0})
    )
    flows = {
        row["month"]: row
        for row in in_period.values("month").annotate(
            money_in=Sum(Case(When(amount_cents__gt=0, then="amount_cents"), default=0, output_field=BigIntegerField())),
            money_out=Sum(Case(When(amount_cents__lt=0, then="amount_cents"), default=0, output_field=BigIntegerField())),
        )
    }

    rows = _category_rows(months, spent, full)
    # No category is marked as income: one that took in more than it paid
    # out over the period counts as income.
    categories = [r for r in rows if r["total_cents"] >= 0]
    income_categories = sorted(
        (_as_income(r, full) for r in rows if r["total_cents"] < 0), key=lambda r: -r["total_cents"]
    )
    loose = [-loose_out.get(m, 0) for m in months]
    loose_income = [loose_in.get(m, 0) for m in months]
    spending = [sum(r["cents"][i] for r in categories) + loose[i] for i in range(len(months))]
    income = [sum(r["cents"][i] for r in income_categories) + loose_income[i] for i in range(len(months))]
    net = [i - s for i, s in zip(income, spending)]
    money_in = [flows.get(m, {}).get("money_in") or 0 for m in months]
    money_out = [-(flows.get(m, {}).get("money_out") or 0) for m in months]

    return {
        **report,
        "full_months": [report["months"][i] for i in full],
        "income_categories": income_categories,
        "uncategorized_income": _figures(loose_income, full) if any(loose_income) else None,
        "categories": categories,
        "uncategorized": _figures(loose, full) if any(loose) else None,
        "spending": _figures(spending, full),
        "income": _figures(income, full),
        "net": _figures(net, full),
        "savings_rate": {
            "percents": [_rate(n, i) for n, i in zip(net, income)],
            "total": _rate(sum(net), sum(income)),
        },
        "in_out": [
            {"month": report["months"][i], "in_cents": money_in[i], "out_cents": money_out[i]}
            for i in range(len(months))
        ],
    }


def spending_cell(month, category=None, direct=False, income=False):
    """The rows behind one figure: `category` with its subcategories, only
    its own rows when `direct`, or uncategorized rows of the figure's
    direction with no category. `income` is for figures of money in. The
    figure's own direction comes first, largest first."""
    rows = counted_transactions(include_archived=True).filter(date__gte=month, date__lt=month_range(month))
    if category is None:
        rows = rows.filter(category__isnull=True, **({"amount_cents__gt": 0} if income else {"amount_cents__lt": 0}))
    elif direct:
        rows = rows.filter(category=category)
    else:
        ids = [category.id, *category.subcategories.values_list("id", flat=True)]
        rows = rows.filter(category_id__in=ids)
    order = "-amount_cents" if income else "amount_cents"
    return rows.select_related("account", "category__parent", "split_parent").order_by(order, "-date", "-id")

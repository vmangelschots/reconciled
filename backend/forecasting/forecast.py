"""The Everyday forecast: the pot's balance day by day over 30 or 90 days,
from bills, loan installments, budgets and expected items - see
openspec/specs/forecasting.

Nothing is stored. Every item comes from the code that owns its rules
(bill states from budgets/bills.py, installment states from
transactions/loans.py, budget figures from budgets/summary.py and
budgets/yearly.py, expected items from forecasting/expected.py), so the
forecast never disagrees with the Budgets page or a loan's schedule.

The current month knows what already happened: what is paid, posted or
received is left out, and what is late is expected tomorrow. Later months
take every item on its day.
"""

from datetime import date, timedelta

from accounts.models import Loan
from budgets.bills import due_date
from budgets.loan_categories import loan_categories
from budgets.models import BudgetSettings, Category
from budgets.summary import (
    budget_rows,
    budgeted_categories,
    has_budget,
    monthly_limits,
    subcategories_by_parent,
)
from budgets.utils import month_range
from budgets.yearly import budgeted_period, prorated_cents, target_counts, values_for_year, yearly_rows
from reports.balances import tier_balance
from transactions.loans import DUE, MISSED, UPCOMING, installment_states

from .expected import blocked_category_ids, month_status, pot_tier
from .models import ExpectedItem

HORIZONS = (30, 90)

# Bill states still to be paid, and so forecast.
OPEN_BILL_STATES = {"upcoming", "due_soon", "not_seen"}
YEARLY_KINDS = {Category.BudgetKind.YEARLY, Category.BudgetKind.TARGET}


def _months(first, last):
    """First-of-month dates from `first`'s month through `last`'s."""
    month = first.replace(day=1)
    while month <= last:
        yield month
        month = month_range(month)


def _item(day, cents, name, source, detail, link, late_since=None):
    return {
        "date": day,
        "amount_cents": cents,
        "name": name,
        "source": source,
        "detail": detail,
        "late_since": late_since,
        "link": link,
    }


def _when(day, today):
    """(date it is forecast on, original day when moved): a day of today or
    earlier is expected tomorrow."""
    return (day, None) if day > today else (today + timedelta(days=1), day)


class _Budgets:
    """Budget figures shared by the collectors, loaded once."""

    def __init__(self, today):
        self.today = today
        self.categories = list(budgeted_categories().select_related("parent").prefetch_related("bills", "yearly_budgets"))
        self.by_id = {c.id: c for c in self.categories}
        self.children = subcategories_by_parent(self.categories)
        self.loan_ids = loan_categories()
        self.this_month = today.replace(day=1)
        self.rows = budget_rows(self.this_month, today)
        self.rows_by_id = {r["category_id"]: r for r in self.rows}

    def bills_category(self, category):
        return category.budget_kind == Category.BudgetKind.BILLS and category.id not in self.loan_ids

    def open_lines(self, category_id):
        """This month's bill lines of a Bills category still to be paid."""
        row = self.rows_by_id.get(category_id) or {}
        return [line for line in row.get("bills", []) if line["state"] in OPEN_BILL_STATES]

    def bills_counting(self, category, month):
        return [b for b in category.bills.all() if b.counts_in(month)]

    def sub_bills_cents(self, category, month):
        """What the Bills subcategories of `category` still forecast in
        `month`: the open lines this month, every bill later."""
        total = 0
        for sub in self.children.get(category.id, []):
            if sub.budget_kind != Category.BudgetKind.BILLS:
                continue
            if month == self.this_month:
                total += sum(line["amount_cents"] for line in self.open_lines(sub.id))
            elif sub.id not in self.loan_ids:
                total += sum(b.amount_cents for b in self.bills_counting(sub, month))
        return total


def _bill_items(budgets, today, end):
    items, missed = [], []
    for category in budgets.categories:
        if not budgets.bills_category(category):
            continue
        link = {"category": category.id}
        for month in _months(today, end):
            if month == budgets.this_month:
                row = budgets.rows_by_id.get(category.id) or {}
                for line in row.get("bills", []):
                    if line["state"] == "missed":
                        missed.append(_item(line["due_date"], -line["amount_cents"], line["name"], "bill",
                                            {"category": category.name}, {**link, "month": month}))
                    if line["state"] not in OPEN_BILL_STATES:
                        continue
                    day, late_since = _when(line["due_date"], today)
                    items.append(_item(day, -line["amount_cents"], line["name"], "bill",
                                       {"category": category.name}, {**link, "month": month}, late_since))
            else:
                for bill in budgets.bills_counting(category, month):
                    items.append(_item(due_date(month, bill.day), -bill.amount_cents, bill.name, "bill",
                                       {"category": category.name}, {**link, "month": month}))
    return items, missed


def _installment_items(today, end, tier):
    items, missed = [], []
    this_month = today.replace(day=1)
    loans = Loan.objects.filter(account__archived=False).select_related("account", "paid_from").prefetch_related(
        "corrections", "adjustments"
    )
    for loan in loans:
        if loan.paid_from.tier != tier:
            continue
        for installment, state, _ in installment_states(loan, today):
            if installment.date > end:
                break
            link = {"account": loan.account_id, "installment": installment.number}
            detail = {"loan": loan.account.name, "number": installment.number, "of": loan.term_months}
            if state == MISSED and installment.date >= this_month:
                missed.append(_item(installment.date, -installment.payment_cents, loan.account.name, "installment",
                                    detail, link))
            if state not in (DUE, UPCOMING) or installment.date < this_month:
                continue
            day, late_since = _when(installment.date, today)
            items.append(_item(day, -installment.payment_cents, loan.account.name, "installment", detail, link,
                               late_since))
    return items, missed


def _spread(total_cents, first, last):
    """{day: cents} spreading `total_cents` evenly over first..last, the
    remainder on the last day so the total is exact."""
    days = (last - first).days + 1
    if total_cents <= 0 or days <= 0:
        return {}
    each, rest = divmod(total_cents, days)
    spread = {first + timedelta(days=i): each for i in range(days)}
    spread[last] += rest
    return spread


def _budget_item(name, category_id, month, spread, end, total_cents, until, kind):
    """One line for a spread budget: the part within the horizon, and its
    daily amounts."""
    within = {day: cents for day, cents in spread.items() if day <= end}
    if not within:
        return None
    first = min(within)
    item = _item(first, -sum(within.values()), name, "budget",
                 {"kind": kind, "total_cents": total_cents, "until": until},
                 {"category": category_id, "month": month})
    item["per_day"] = {day: -cents for day, cents in within.items()}
    return item


def _monthly_budget_items(budgets, today, end):
    items = []
    tomorrow = today + timedelta(days=1)
    for month in _months(tomorrow, end):
        last = month_range(month) - timedelta(days=1)
        if month == budgets.this_month:
            limits = {r["category_id"]: r["limit_cents"] for r in budgets.rows if r["limit_cents"] is not None}
            spent = {r["category_id"]: r["spent_cents"] for r in budgets.rows}
            first = tomorrow
        else:
            limits, _ = monthly_limits(month, loan_lines={})
            spent = {}
            first = month
        for category in budgets.categories:
            if category.budget_kind != Category.BudgetKind.MONTHLY or category.id not in limits:
                continue
            if category.parent is not None and has_budget(category.parent, limits):
                continue
            left = max(limits[category.id] - spent.get(category.id, 0), 0)
            total = max(left - budgets.sub_bills_cents(category, month), 0)
            item = _budget_item(category.name, category.id, month, _spread(total, first, last), end, total, last,
                                "monthly")
            if item:
                items.append(item)
    return items


def _covered_yearly(category, limits):
    return category.parent is not None and has_budget(category.parent, limits)


def _yearly_items(budgets, today, end):
    """Yearly budgets spread over the rest of the year, targets on their due
    date - this year from the Budgets page's figures, later years from their
    amounts."""
    items = []
    tomorrow = today + timedelta(days=1)
    start = BudgetSettings.load().start_month
    limits_now, _ = monthly_limits(budgets.this_month, loan_lines={})
    this_year = yearly_rows(budgets.this_month, today)
    for row in this_year["categories"]:
        category = budgets.by_id.get(row["category_id"])
        if category is None or _covered_yearly(category, limits_now):
            continue
        link = {"category": category.id, "month": budgets.this_month}
        if row["kind"] == Category.BudgetKind.TARGET:
            if row["state"] not in ("upcoming", "due_soon", "not_seen"):
                continue
            left = max(row["amount_cents"] - row["spent_cents"], 0)
            day, late_since = _when(row["due_date"], today)
            if left and day <= end:
                items.append(_item(day, -left, category.name, "target", {"due": row["due_date"]},
                                   {"category": category.id, "month": row["due_date"].replace(day=1)}, late_since))
            continue
        year_end = date(today.year, 12, 31)
        sub_bills = sum(budgets.sub_bills_cents(category, m) for m in _months(today, year_end))
        total = max(row["budget_cents"] - row["spent_cents"] - sub_bills, 0)
        item = _budget_item(category.name, category.id, budgets.this_month, _spread(total, tomorrow, year_end), end,
                            total, year_end, "yearly")
        if item:
            items.append(item)

    for year in range(today.year + 1, end.year + 1):
        period = budgeted_period(year, start)
        if period is None:
            continue
        january = date(year, 1, 1)
        limits, _ = monthly_limits(january, loan_lines={})
        for category in budgets.categories:
            if category.budget_kind not in YEARLY_KINDS or _covered_yearly(category, limits):
                continue
            values = values_for_year(category.yearly_budgets.all(), year)
            if values is None:
                continue
            link = {"category": category.id, "month": january}
            if category.budget_kind == Category.BudgetKind.TARGET:
                due = date(year, values.due_month, values.due_day)
                if target_counts(due, start) and due <= end:
                    items.append(_item(due, -values.amount_cents, category.name, "target", {"due": due},
                                       {"category": category.id, "month": due.replace(day=1)}))
                continue
            sub_bills = sum(budgets.sub_bills_cents(category, m) for m in _months(period[0], period[1]))
            total = max(prorated_cents(values.amount_cents, year, start) - sub_bills, 0)
            item = _budget_item(category.name, category.id, link["month"], _spread(total, period[0], period[1]), end,
                                total, period[1], "yearly")
            if item:
                items.append(item)
    return items


def _expected_items(today, end, tier):
    items = []
    blocked = blocked_category_ids()
    this_month = today.replace(day=1)
    for item in ExpectedItem.objects.select_related("category", "account"):
        status = month_status(item, today, blocked=blocked, tier=tier)
        if status.next_on is None:
            continue
        detail = {"category": item.category.name if item.category else None,
                  "account": item.account.name if item.account else None}
        link = {"expected": item.id}
        late_since = None
        if status.status in ("late", "unrecognisable") and status.next_on == today + timedelta(days=1):
            late_since = due_date(this_month, item.day)
            late_since = late_since if late_since <= today else None
        first = status.next_on
        if first <= end:
            items.append(_item(first, item.signed_cents, item.name, "expected", detail, link, late_since))
        month = month_range(first.replace(day=1))
        while due_date(month, item.day) <= end:
            items.append(_item(due_date(month, item.day), item.signed_cents, item.name, "expected", detail, link))
            month = month_range(month)
    return items


def everyday_forecast(today, horizon_days):
    """The pot's forecast from the end of `today` over `horizon_days`:
    {tier, start_balance_cents, horizon_days, items, missed, points,
    lowest, has_income}. Points run from today (the start balance) to the
    horizon's last day; `lowest` is the lowest point after today."""
    end = today + timedelta(days=horizon_days)
    tier = pot_tier()
    start_balance = tier_balance(tier, today)
    budgets = _Budgets(today)

    bills, missed_bills = _bill_items(budgets, today, end)
    installments, missed_installments = _installment_items(today, end, tier)
    items = [
        *bills,
        *installments,
        *_monthly_budget_items(budgets, today, end),
        *_yearly_items(budgets, today, end),
        *_expected_items(today, end, tier),
    ]
    items = [i for i in items if today < i["date"] <= end]

    by_day = {}
    for item in items:
        for day, cents in (item.get("per_day") or {item["date"]: item["amount_cents"]}).items():
            by_day[day] = by_day.get(day, 0) + cents

    points, balance = [], start_balance
    for offset in range(horizon_days + 1):
        day = today + timedelta(days=offset)
        balance += by_day.get(day, 0)
        points.append({"date": day, "balance_cents": balance})
    lowest = min(points[1:], key=lambda p: p["balance_cents"]) if len(points) > 1 else None

    for item in items:
        item.pop("per_day", None)
    order = {"expected": 0, "bill": 1, "installment": 2, "target": 3, "budget": 4}
    items.sort(key=lambda i: (i["date"], order[i["source"]], i["name"]))
    missed = sorted(missed_bills + missed_installments, key=lambda i: (i["date"], i["name"]))
    return {
        "tier": tier,
        "start_balance_cents": start_balance,
        "horizon_days": horizon_days,
        "items": items,
        "missed": missed,
        "points": points,
        "lowest": lowest,
        "has_income": ExpectedItem.objects.filter(direction=ExpectedItem.Direction.IN).exists(),
    }

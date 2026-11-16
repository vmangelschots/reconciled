"""A year's budget per category, from the real budget (Current) or from a
draft - see openspec/specs/year-plans.

Both come out in one shape, YearBudget, so totals, the Change column and
"changed since copied" are worked out the same way for either. Current is
always built from the real budget, never stored; a draft is its PlanBudgets
over Current: months before its from month are Current's, and a kind switch
holds for the whole year, as applying it does (see apply.py).
"""

from dataclasses import asdict, dataclass, field
from datetime import date

from django.db.models import Sum

from transactions.models import Transaction

from .defaults import defaults_of
from .loan_bills import loan_lines
from .loan_categories import loan_categories
from .models import Bill, BudgetSettings, Category, IncomeLine, PlanBudget, YearPlan
from .summary import YEARLY_KINDS, budgeted_categories, default_in_effect, spent_by_category
from .yearly import prorated_cents, target_counts, values_for_year

NONE = PlanBudget.NONE
MONTHS = range(1, 13)
MONTHLY_KINDS = {Category.BudgetKind.MONTHLY, Category.BudgetKind.BILLS}


def first_of(year, month):
    return date(year, month, 1)


@dataclass
class YearBudget:
    """One category's budget for a year. `months` holds the limit of each
    month (index 0 is January; None for no limit) for monthly, Bills and
    loan categories; `amount_cents` / `due` the yearly kinds' values.
    `year_cents` is what the plan sets aside for the year."""

    category_id: int
    kind: str
    locked: bool = False
    months: list = field(default_factory=lambda: [None] * 12)
    default_cents: int | None = None
    exceptions: dict = field(default_factory=dict)
    # A draft's own month amounts before its from month, kept but not
    # applied - see "Moving the from month".
    kept: dict = field(default_factory=dict)
    amount_cents: int | None = None
    due: str | None = None
    bills: list = field(default_factory=list)
    year_cents: int = 0

    @property
    def has_budget(self):
        return self.kind != NONE

    def comparable(self):
        """What "changed" compares: the budget's figures, not how they're shown."""
        return {
            "kind": self.kind,
            "months": list(self.months),
            "amount_cents": self.amount_cents,
            "due": self.due,
            "year_cents": self.year_cents,
        }

    def display_cents(self):
        """The figure a person reads as "the budget": a month's default, a
        yearly amount, or the year's total for Bills."""
        if self.kind == Category.BudgetKind.MONTHLY:
            return self.default_cents
        if self.kind in YEARLY_KINDS:
            return self.amount_cents
        return self.year_cents if self.has_budget else None

    def snapshot(self):
        """What a draft keeps of Current when copied (PlanBudget.base)."""
        return {**self.comparable(), "display_cents": self.display_cents()}

    def as_dict(self):
        return asdict(self)


def _yearly_cents(kind, amount_cents, due, year, start):
    """A yearly budget's amount for the year, pro-rated in the start
    month's year; a target's when it counts that year."""
    if kind == Category.BudgetKind.TARGET:
        due_month, due_day = (int(part) for part in due.split("-"))
        return amount_cents if target_counts(date(year, due_month, due_day), start) else 0
    return prorated_cents(amount_cents, year, start)


def _sum_months(months):
    return sum(m for m in months if m is not None)


def _bill_line(bill, year):
    """A real bill as a draft bill line: months 1-12 of `year`."""
    from_month = 1 if bill.from_month.year < year else bill.from_month.month
    until = None
    if bill.until_month is not None:
        until = bill.until_month.month if bill.until_month.year == year else None
    return {"name": bill.name, "day": bill.day, "amount_cents": bill.amount_cents, "from_month": from_month,
            "until_month": until}


def current_budgets(year, today, display_month=1):
    """{category_id: YearBudget} for every budgeted category, from the real
    budget. A monthly row shows the default in effect in `display_month`."""
    start = BudgetSettings.load().start_month
    categories = list(budgeted_categories().prefetch_related("limits", "yearly_budgets"))
    loans = loan_categories()
    year_start, year_end = first_of(year, 1), date(year + 1, 1, 1)
    bills_by_category = {}
    for bill in Bill.objects.filter(category__in=categories, from_month__lt=year_end).order_by("day", "id"):
        if bill.until_month is None or bill.until_month >= year_start:
            bills_by_category.setdefault(bill.category_id, []).append(bill)
    loan_months = {}
    if loans:
        for m in MONTHS:
            for category_id, lines in loan_lines(first_of(year, m), today).items():
                months = loan_months.setdefault(category_id, [None] * 12)
                months[m - 1] = (months[m - 1] or 0) + sum(line["amount_cents"] for line in lines)

    result = {}
    for category in categories:
        kind = category.budget_kind
        budget = YearBudget(category_id=category.id, kind=kind)
        if category.id in loans:
            budget.kind = Category.BudgetKind.BILLS
            budget.locked = True
            budget.months = loan_months.get(category.id, [None] * 12)
        elif kind == Category.BudgetKind.MONTHLY:
            defaults = defaults_of(category)
            overrides = {
                limit.month.month: limit.limit_cents
                for limit in category.limits.all()
                if limit.month is not None and limit.month.year == year
            }
            for m in MONTHS:
                row = default_in_effect(defaults, first_of(year, m))
                budget.months[m - 1] = overrides.get(m, row.limit_cents if row else None)
            shown = default_in_effect(defaults, first_of(year, display_month))
            budget.default_cents = shown.limit_cents if shown else None
            budget.exceptions = {str(m): cents for m, cents in overrides.items()}
            if all(value is None for value in budget.months):
                budget.kind = NONE
        elif kind == Category.BudgetKind.BILLS:
            lines = bills_by_category.get(category.id, [])
            for m in MONTHS:
                month = first_of(year, m)
                counting = [bill.amount_cents for bill in lines if bill.counts_in(month)]
                budget.months[m - 1] = sum(counting) if counting else None
            budget.bills = [_bill_line(bill, year) for bill in lines]
        else:
            values = values_for_year(category.yearly_budgets.all(), year)
            if values is None:
                budget.kind = NONE
            else:
                budget.amount_cents = values.amount_cents
                if kind == Category.BudgetKind.TARGET:
                    budget.due = f"{values.due_month:02d}-{values.due_day:02d}"
        budget.year_cents = _year_cents(budget, year, start)
        result[category.id] = budget
    return result


def _year_cents(budget, year, start):
    if budget.kind == NONE:
        return 0
    if budget.kind in YEARLY_KINDS:
        return _yearly_cents(budget.kind, budget.amount_cents, budget.due, year, start)
    return _sum_months(budget.months)


def _draft_months(plan_budget, from_month):
    """A same-kind monthly or Bills draft's limit for each month it covers."""
    months = [None] * 12
    for m in range(from_month, 13):
        if plan_budget.kind == Category.BudgetKind.MONTHLY:
            months[m - 1] = plan_budget.month_cents.get(str(m), plan_budget.default_cents)
        else:
            counting = [bill.amount_cents for bill in plan_budget.bills.all() if bill.counts_in(m)]
            months[m - 1] = sum(counting) if counting else None
    return months


def draft_budget(plan_budget, current, year, from_month, start):
    """The draft's YearBudget for one category over Current's."""
    kind = plan_budget.kind
    budget = YearBudget(category_id=plan_budget.category_id, kind=kind)
    if kind == Category.BudgetKind.MONTHLY:
        budget.default_cents = plan_budget.default_cents
        budget.exceptions = {
            key: cents for key, cents in plan_budget.month_cents.items() if int(key) >= from_month
        }
        budget.kept = {key: cents for key, cents in plan_budget.month_cents.items() if int(key) < from_month}
    if kind == Category.BudgetKind.BILLS:
        budget.bills = [
            {"id": bill.id, "name": bill.name, "day": bill.day, "amount_cents": bill.amount_cents,
             "from_month": bill.from_month, "until_month": bill.until_month}
            for bill in plan_budget.bills.all()
        ]
    if kind in YEARLY_KINDS:
        budget.amount_cents = plan_budget.amount_cents
        if kind == Category.BudgetKind.TARGET:
            budget.due = f"{plan_budget.due_month:02d}-{plan_budget.due_day:02d}"
    if kind in MONTHLY_KINDS:
        months = _draft_months(plan_budget, from_month)
        if current is not None and current.kind == kind:
            # Earlier months stay real; a kind switch holds for the whole year.
            months[: from_month - 1] = current.months[: from_month - 1]
        budget.months = months
    budget.year_cents = _year_cents(budget, year, start)
    return budget


def plan_budgets(plan, today, current=None):
    """{category_id: YearBudget} for a draft or applied plan: Current's,
    with the draft's own budgets over it. A category the draft holds no
    budget for is left as Current has it."""
    if current is None:
        current = current_budgets(plan.year, today, plan.from_month)
    start = BudgetSettings.load().start_month
    result = dict(current)
    for plan_budget in plan.budgets.prefetch_related("bills"):
        existing = current.get(plan_budget.category_id)
        if existing is not None and existing.locked:
            continue
        result[plan_budget.category_id] = draft_budget(plan_budget, existing, plan.year, plan.from_month, start)
    return result


def counted_cents(budgets, categories):
    """The year's expenses: each top-level budget once (its subcategories'
    caps inside it), and a subcategory's own budget only under a parent
    without one."""
    parents = {category.id: category.parent_id for category in categories}
    total = 0
    for category_id, budget in budgets.items():
        if not budget.has_budget:
            continue
        parent_id = parents.get(category_id)
        parent = budgets.get(parent_id) if parent_id is not None else None
        if parent is not None and parent.has_budget:
            continue
        total += budget.year_cents
    return total


# -- Actual figures and the year view ---------------------------------------


def add_months(month, count):
    index = month.year * 12 + month.month - 1 + count
    return date(index // 12, index % 12 + 1, 1)


def actual_range(year, today):
    """(kind, first day, day after the last) of what Actual covers: the last
    12 complete months for a future year, so far for the current year, the
    whole year for a past one."""
    if year > today.year:
        this_month = today.replace(day=1)
        return "last_12", add_months(this_month, -12), this_month
    if year == today.year:
        return "so_far", date(year, 1, 1), date.fromordinal(today.toordinal() + 1)
    return "year", date(year, 1, 1), date(year + 1, 1, 1)


def uncategorized_out(start, end):
    """Uncategorized outflows in [start, end), as spending."""
    total = (
        Transaction.objects.counted_rows()
        .excluding_adjustments()
        .filter(category__isnull=True, transfer_counterpart__isnull=True, amount_cents__lt=0, date__gte=start,
                date__lt=end)
        .aggregate(total=Sum("amount_cents"))["total"]
        or 0
    )
    return -total


def income_plan_cents(line, months=MONTHS):
    """An income line's plan over `months` (1-12)."""
    months = list(months)
    base = line.amount_cents * len(months) if line.per == IncomeLine.Per.MONTH else (
        line.amount_cents if len(months) == 12 else line.amount_cents * len(months) // 12
    )
    return base + sum(int(cents) for key, cents in line.extra.items() if int(key) in months)


def current_plan_row(year, create=False):
    """The row holding Current's income lines for `year`."""
    if create:
        return YearPlan.objects.get_or_create(year=year, kind=YearPlan.Kind.CURRENT)[0]
    return YearPlan.objects.filter(year=year, kind=YearPlan.Kind.CURRENT).first()


def year_view(year, today, plan=None):
    """Everything the Year view shows for Current (`plan` None) or a draft
    or applied plan of `year` - see openspec/specs/year-plans."""
    from_month = plan.from_month if plan is not None else (today.month if year == today.year else 1)
    current = current_budgets(year, today, from_month)
    budgets = plan_budgets(plan, today, current) if plan is not None else current
    categories = list(budgeted_categories().select_related("parent"))
    by_id = {c.id: c for c in categories}
    children = {}
    for c in categories:
        if c.parent_id is not None:
            children.setdefault(c.parent_id, []).append(c.id)

    kind, start, end = actual_range(year, today)
    spent = spent_by_category(categories, start, end)
    in_progress = year == today.year
    month_spent = {}
    if in_progress:
        this_month = today.replace(day=1)
        month_spent = spent_by_category(categories, this_month, add_months(this_month, 1))

    def covered(category_id):
        parent_id = by_id[category_id].parent_id
        return parent_id is not None and budgets.get(parent_id) is not None and budgets[parent_id].has_budget

    def under(category_id, figures):
        own = figures.get(category_id, 0)
        if budgets[category_id].has_budget:
            own += sum(figures.get(sub, 0) for sub in children.get(category_id, []))
        return own

    def heading(budget, actual_cents, category_id):
        """Actual so far plus the plan for what's still to come."""
        if budget.kind in YEARLY_KINDS:
            return max(actual_cents, budget.year_cents)
        later = _sum_months(budget.months[today.month:])
        this = budget.months[today.month - 1] or 0
        return actual_cents + later + max(this - under(category_id, month_spent), 0)

    bases = {}
    if plan is not None:
        bases = {pb.category_id: pb.base for pb in plan.budgets.all()}

    rows = []
    for category in categories:
        budget = budgets[category.id]
        is_covered = covered(category.id)
        if not budget.has_budget and not (plan is not None and category.id in bases):
            continue
        actual_cents = under(category.id, spent)
        row = {
            **budget.as_dict(),
            "category_name": category.name,
            "parent_id": category.parent_id,
            "covered_by_parent": is_covered,
            "counted": budget.has_budget and not is_covered,
            "plan_cents": budget.year_cents,
            "actual_cents": actual_cents,
            "heading_cents": heading(budget, actual_cents, category.id) if in_progress and budget.has_budget else None,
            "current": None,
            "change_cents": None,
            "changed": False,
            "changed_since_copy": None,
        }
        if plan is not None:
            now = current[category.id]
            row["current"] = {"kind": now.kind, "plan_cents": now.year_cents, "display_cents": now.display_cents()}
            row["changed"] = budget.comparable() != now.comparable()
            row["change_cents"] = budget.year_cents - now.year_cents if row["changed"] else None
            base = bases.get(category.id, "missing")
            if base == "missing":
                base = None if now.has_budget else now.snapshot()
            if base is None or {k: v for k, v in base.items() if k != "display_cents"} != now.comparable():
                if plan.kind == YearPlan.Kind.DRAFT and (base is not None or now.has_budget):
                    row["changed_since_copy"] = {
                        "from_cents": base.get("display_cents") if base else None,
                        "to_cents": now.display_cents(),
                    }
        rows.append(row)

    # Spending outside the plan: categories without a budget, not under a
    # budgeted parent, plus uncategorized outflows.
    outside = sum(
        max(spent.get(c.id, 0), 0)
        for c in categories
        if not budgets[c.id].has_budget and not covered(c.id) and spent.get(c.id, 0) > 0
    )
    outside += uncategorized_out(start, end)

    income_plan = plan if plan is not None else current_plan_row(year)
    lines = list(income_plan.income_lines.all()) if income_plan is not None else []
    income_rows = []
    for line in lines:
        actual = None
        heading_cents = None
        if line.category_id is not None and line.category_id in by_id:
            ids = [line.category_id, *children.get(line.category_id, [])]
            actual = -sum(spent.get(i, 0) for i in ids)
        plan_cents = income_plan_cents(line)
        if in_progress:
            if actual is None:
                heading_cents = plan_cents
            elif line.per == IncomeLine.Per.MONTH:
                heading_cents = actual + income_plan_cents(line, range(today.month + 1, 13))
            else:
                heading_cents = max(actual, plan_cents)
        income_rows.append({
            "id": line.id, "name": line.name, "amount_cents": line.amount_cents, "per": line.per,
            "extra": line.extra, "category_id": line.category_id, "plan_cents": plan_cents,
            "actual_cents": actual, "heading_cents": heading_cents,
        })

    income_cents = sum(r["plan_cents"] for r in income_rows)
    expenses_cents = counted_cents(budgets, categories)
    totals = {
        "income_cents": income_cents,
        "expenses_cents": expenses_cents,
        "left_cents": income_cents - expenses_cents,
        "share": round((income_cents - expenses_cents) * 100 / income_cents) if income_cents > 0 else None,
        "actual_income_cents": sum(r["actual_cents"] or 0 for r in income_rows),
        "actual_expenses_cents": sum(r["actual_cents"] for r in rows if r["counted"]) + outside,
        "change_left_cents": None,
        "heading_left_cents": None,
        "heading_expenses_cents": None,
    }
    if plan is not None:
        current_lines = current_plan_row(year)
        current_income = sum(income_plan_cents(l) for l in current_lines.income_lines.all()) if current_lines else 0
        current_left = current_income - counted_cents(current, categories)
        totals["change_left_cents"] = totals["left_cents"] - current_left
    if in_progress:
        heading_income = sum(r["heading_cents"] or 0 for r in income_rows)
        heading_expenses = sum(r["heading_cents"] or 0 for r in rows if r["counted"]) + outside
        totals["heading_expenses_cents"] = heading_expenses
        totals["heading_left_cents"] = heading_income - heading_expenses if income_rows else None

    return {
        "year": year,
        "from_month": from_month,
        "actual": {"kind": kind, "from": start, "until": date.fromordinal(end.toordinal() - 1)},
        "split_month": today.month if in_progress else None,
        "income": income_rows,
        "rows": rows,
        "not_in_plan_cents": outside,
        "totals": totals,
        "has_income": bool(income_rows),
        "has_budgets": any(r["plan_cents"] or r["kind"] != NONE for r in rows),
    }

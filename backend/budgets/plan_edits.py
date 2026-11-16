"""Making and editing drafts - see openspec/specs/year-plans.

A draft copies Current's budgets (or another draft's) into PlanBudgets, so it
can be changed without touching the real budget. Each copied budget keeps
`base`, Current's figures at the copy, to flag rows whose real budget changed
since.
"""

from django.utils import timezone

from .models import Category, IncomeLine, PlanBill, PlanBudget, YearPlan
from .plans import NONE, YEARLY_KINDS, current_budgets, current_plan_row


class PlanError(ValueError):
    """A refused change, with a message for the person."""


def default_name(year, from_month):
    base = f"{year} plan" if from_month == 1 else f"Rest of {year}"
    taken = set(YearPlan.objects.filter(year=year).values_list("name", flat=True))
    if base not in taken:
        return base
    number = 2
    while f"{base} {number}" in taken:
        number += 1
    return f"{base} {number}"


def default_from_month(year, today):
    """January for a future year; next month for this year (December
    stays December)."""
    if year > today.year:
        return 1
    return min(today.month + 1, 12)


def _plan_budget_from(budget, plan):
    """A PlanBudget copying Current's YearBudget for one category."""
    plan_budget = PlanBudget(plan=plan, category_id=budget.category_id, kind=budget.kind, base=budget.snapshot())
    if budget.kind == Category.BudgetKind.MONTHLY:
        default = budget.default_cents
        plan_budget.default_cents = default
        plan_budget.month_cents = {
            str(m): cents for m, cents in enumerate(budget.months, start=1) if cents is not None and cents != default
        }
    elif budget.kind in YEARLY_KINDS:
        plan_budget.amount_cents = budget.amount_cents
        if budget.due:
            plan_budget.due_month, plan_budget.due_day = (int(part) for part in budget.due.split("-"))
    return plan_budget


def copy_current_budget(plan, budget):
    """Put Current's budget for one category into the draft, replacing what
    the draft had for it."""
    PlanBudget.objects.filter(plan=plan, category_id=budget.category_id).delete()
    plan_budget = _plan_budget_from(budget, plan)
    plan_budget.save()
    for line in budget.bills:
        PlanBill.objects.create(
            plan_budget=plan_budget,
            name=line["name"],
            day=line["day"],
            amount_cents=line["amount_cents"],
            from_month=line["from_month"],
            until_month=line["until_month"],
        )
    return plan_budget


def _copy_income(lines, plan):
    for line in lines:
        IncomeLine.objects.create(
            plan=plan, name=line.name, amount_cents=line.amount_cents, per=line.per, extra=dict(line.extra),
            category_id=line.category_id,
        )


def create_draft(year, today, source=None, name=None, from_month=None):
    """A new draft of `year`, copying Current (`source` None) or another
    plan of that year."""
    if year < today.year:
        raise PlanError("A past year can't get a new draft.")
    if from_month is None:
        from_month = default_from_month(year, today)
    plan = YearPlan.objects.create(
        year=year,
        kind=YearPlan.Kind.DRAFT,
        name=name or default_name(year, from_month),
        from_month=from_month,
        copied_at=timezone.now(),
    )
    current = current_budgets(year, today, from_month)
    if source is None:
        for budget in current.values():
            if budget.has_budget and not budget.locked:
                copy_current_budget(plan, budget)
        row = current_plan_row(year)
        _copy_income(row.income_lines.all() if row else [], plan)
        return plan
    for source_budget in source.budgets.prefetch_related("bills"):
        now = current.get(source_budget.category_id)
        plan_budget = PlanBudget.objects.create(
            plan=plan,
            category_id=source_budget.category_id,
            kind=source_budget.kind,
            default_cents=source_budget.default_cents,
            month_cents=dict(source_budget.month_cents),
            amount_cents=source_budget.amount_cents,
            due_month=source_budget.due_month,
            due_day=source_budget.due_day,
            base=now.snapshot() if now is not None else None,
        )
        for bill in source_budget.bills.all():
            PlanBill.objects.create(
                plan_budget=plan_budget, name=bill.name, day=bill.day, amount_cents=bill.amount_cents,
                from_month=bill.from_month, until_month=bill.until_month,
            )
    _copy_income(source.income_lines.all(), plan)
    return plan


def check_editable(plan, today):
    if plan.kind != YearPlan.Kind.DRAFT:
        raise PlanError("This plan was applied. Duplicate it to change it.")
    if plan.year < today.year:
        raise PlanError("A past year's draft can't be changed.")


def plan_budget_for(plan, category, today):
    """The draft's PlanBudget for `category`, made from Current's when the
    draft has none yet."""
    plan_budget = plan.budgets.filter(category=category).first()
    if plan_budget is not None:
        return plan_budget
    budget = current_budgets(plan.year, today, plan.from_month)[category.id]
    return copy_current_budget(plan, budget)


def set_budget(plan, category, today, kind, default_cents=None, months=None, amount_cents=None, due=None):
    """Set a draft's budget for `category`: its kind, a monthly default with
    month exceptions ({"12": cents}), or a yearly amount and due date."""
    plan_budget = plan_budget_for(plan, category, today)
    if kind == Category.BudgetKind.MONTHLY:
        if default_cents is None:
            raise PlanError("A monthly budget needs an amount.")
        months = months or {}
        early = [m for m in months if int(m) < plan.from_month]
        if early:
            raise PlanError("Months before the draft's from month use the real budget.")
        kept = {key: cents for key, cents in plan_budget.month_cents.items() if int(key) < plan.from_month}
        plan_budget.default_cents = default_cents
        plan_budget.month_cents = {
            **kept,
            **{str(int(m)): cents for m, cents in months.items() if cents is not None and cents != default_cents},
        }
        plan_budget.amount_cents = plan_budget.due_month = plan_budget.due_day = None
    elif kind in YEARLY_KINDS:
        if amount_cents is None:
            raise PlanError("A yearly budget needs an amount.")
        if kind == Category.BudgetKind.TARGET and due is None:
            raise PlanError("A yearly budget on a date needs a due date.")
        plan_budget.amount_cents = amount_cents
        plan_budget.due_month, plan_budget.due_day = due if kind == Category.BudgetKind.TARGET else (None, None)
        plan_budget.default_cents = None
        plan_budget.month_cents = {}
    elif kind == Category.BudgetKind.BILLS:
        plan_budget.default_cents = plan_budget.amount_cents = plan_budget.due_month = plan_budget.due_day = None
        plan_budget.month_cents = {}
    if kind != Category.BudgetKind.BILLS:
        plan_budget.bills.all().delete()
    plan_budget.kind = kind
    plan_budget.save()
    _touch(plan)
    return plan_budget


def remove_budget(plan, category, today):
    plan_budget = plan_budget_for(plan, category, today)
    plan_budget.bills.all().delete()
    plan_budget.kind = NONE
    plan_budget.default_cents = plan_budget.amount_cents = plan_budget.due_month = plan_budget.due_day = None
    plan_budget.month_cents = {}
    plan_budget.save()
    _touch(plan)


def set_bills(plan, category, today, lines):
    """Make `lines` ([{name, day, amount_cents, from_month, until_month}]) the
    draft's bills for `category`, which becomes a Bills budget."""
    plan_budget = plan_budget_for(plan, category, today)
    plan_budget.bills.all().delete()
    for line in lines:
        until = line.get("until_month")
        start = line.get("from_month") or plan.from_month
        if until is not None and until < start:
            raise PlanError("A bill can't end before it starts.")
        PlanBill.objects.create(
            plan_budget=plan_budget, name=line["name"], day=line["day"], amount_cents=line["amount_cents"],
            from_month=start, until_month=until,
        )
    plan_budget.kind = Category.BudgetKind.BILLS
    plan_budget.default_cents = plan_budget.amount_cents = plan_budget.due_month = plan_budget.due_day = None
    plan_budget.month_cents = {}
    plan_budget.save()
    _touch(plan)


def use_current(plan, category, today):
    """Take the real budget's figures for `category` into the draft."""
    budget = current_budgets(plan.year, today, plan.from_month)[category.id]
    copy_current_budget(plan, budget)
    _touch(plan)


def _touch(plan):
    plan.save(update_fields=["updated_at"])

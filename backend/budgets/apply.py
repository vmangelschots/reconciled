"""Applying a draft to the real budget from a month on - see
openspec/specs/year-plans, "Apply preview" and "Applying a draft".

One code path does both: `apply_plan(..., commit=False)` works out the
changes without writing, so the preview can't promise something the apply
doesn't do. From month F of year Y, each of the draft's budgets is written
with the real budget's own rules:

- a kind switch goes as switching kind does in the budget editor, removing
  the old kind's amounts for every month;
- a monthly default is written from F on, later defaults within Y go, and
  the draft's month exceptions replace the real ones from F to December;
- bills that count from F on end the month before F (or go, when they start
  at F or later within Y), and the draft's bills start at F;
- a yearly amount is the year's row (from_year = Y);
- "none" removes the budget.

The draft's income becomes Current's for Y.
"""

from datetime import date

from django.db import transaction
from django.utils import timezone

from .bill_changes import month_before
from .defaults import defaults_of
from .loan_categories import loan_categories
from .models import Bill, Category, CategoryLimit, IncomeLine, YearlyBudget, YearPlan
from .plans import NONE, YEARLY_KINDS, current_budgets, current_plan_row, income_plan_cents
from .summary import default_in_effect, spent_by_category
from .utils import month_range


def _real_kind(category, budget):
    """The category's kind as the budget editor sees it: monthly without
    any limit is no budget."""
    return NONE if budget is None or not budget.has_budget else category.budget_kind


def _removes(category, year):
    """What switching away from the category's kind deletes, as counts."""
    limits = list(category.limits.all())
    return {
        "defaults": sum(1 for limit in limits if limit.month is None),
        "overrides": sum(1 for limit in limits if limit.month is not None),
        "yearly_years": category.yearly_budgets.count(),
        "bills": category.bills.count(),
    }


def _bill_key(line):
    return (line["name"], line["day"], line["amount_cents"], line["from_month"], line["until_month"])


def _change_for(category, budget, plan_budget, from_month, year):
    """The change applying `plan_budget` makes, or None when it makes none."""
    draft_kind = plan_budget.kind
    real = _real_kind(category, budget)
    change = {
        "category_id": category.id,
        "category_name": category.name,
        "from_kind": real,
        "to_kind": draft_kind,
        "kind_switch": None,
        "remove": False,
        "give": False,
        "from_cents": None,
        "to_cents": None,
        "per": None,
        "exceptions": None,
        "bills": None,
    }
    if draft_kind == NONE:
        if real == NONE:
            return None
        change["remove"] = True
        change["kind_switch"] = {"removes": _removes(category, year)}
        return change
    if real == NONE:
        change["give"] = True
    elif category.budget_kind != draft_kind:
        # Between the yearly kinds the amount and history stay.
        between_yearly = category.budget_kind in YEARLY_KINDS and draft_kind in YEARLY_KINDS
        change["kind_switch"] = {"removes": None if between_yearly else _removes(category, year)}

    if draft_kind == Category.BudgetKind.MONTHLY:
        change["per"] = "month"
        before = default_in_effect(defaults_of(category), date(year, from_month, 1)) if real == draft_kind else None
        change["from_cents"] = before.limit_cents if before else None
        change["to_cents"] = plan_budget.default_cents
        draft_exceptions = {int(k): v for k, v in plan_budget.month_cents.items() if int(k) >= from_month}
        real_exceptions = {
            limit.month.month: limit.limit_cents
            for limit in category.limits.all()
            if limit.month is not None and limit.month.year == year and limit.month.month >= from_month
        } if real == draft_kind else {}
        # A month exception equal to the default isn't an exception.
        draft_exceptions = {m: v for m, v in draft_exceptions.items() if v != plan_budget.default_cents}
        if draft_exceptions != real_exceptions:
            change["exceptions"] = {
                "set": sorted(m for m in draft_exceptions if real_exceptions.get(m) != draft_exceptions[m]),
                "removed": sorted(m for m in real_exceptions if m not in draft_exceptions),
            }
        if change["from_cents"] == change["to_cents"] and change["exceptions"] is None and not change["give"] and not change["kind_switch"]:
            later = [
                d for d in defaults_of(category)
                if d.from_month is not None and d.from_month.year == year and d.from_month.month > from_month
            ]
            if not later:
                return None
    elif draft_kind == Category.BudgetKind.BILLS:
        draft_lines = [
            {"name": b.name, "day": b.day, "amount_cents": b.amount_cents, "from_month": max(b.from_month, from_month),
             "until_month": b.until_month}
            for b in plan_budget.bills.all()
            if b.until_month is None or b.until_month >= from_month
        ]
        real_lines = [
            line for line in (budget.bills if budget is not None and real == draft_kind else [])
            if line["until_month"] is None or line["until_month"] >= from_month
        ]
        real_lines = [{**line, "from_month": max(line["from_month"], from_month)} for line in real_lines]
        draft_keys = sorted(_bill_key(line) for line in draft_lines)
        real_keys = sorted(_bill_key(line) for line in real_lines)
        if draft_keys == real_keys and not change["give"] and not change["kind_switch"]:
            return None
        added = [k for k in draft_keys if k not in real_keys]
        ended = [k for k in real_keys if k not in draft_keys]
        change["bills"] = {"added": len(added), "ended": len(ended)}
        change["from_cents"] = sum(k[2] for k in real_keys)
        change["to_cents"] = sum(k[2] for k in draft_keys)
        change["per"] = "month"
    else:
        change["per"] = "year"
        values = budget if budget is not None and real in YEARLY_KINDS else None
        change["from_cents"] = values.amount_cents if values else None
        change["to_cents"] = plan_budget.amount_cents
        due = f"{plan_budget.due_month:02d}-{plan_budget.due_day:02d}" if plan_budget.due_month else None
        change["due"] = due
        if values and values.amount_cents == plan_budget.amount_cents and values.due == due and real == draft_kind:
            return None
    return change


def _write(category, plan_budget, change, from_month, year):
    """Make the real budget of `category` match the draft from `from_month`."""
    first = date(year, from_month, 1)
    year_end = date(year, 12, 1)
    kind = plan_budget.kind
    if kind == NONE:
        category.limits.all().delete()
        category.yearly_budgets.all().delete()
        category.bills.all().delete()
        category.budget_kind = Category.BudgetKind.MONTHLY
        category.save(update_fields=["budget_kind", "updated_at"])
        return
    if change["kind_switch"] is not None and change["kind_switch"]["removes"] is not None:
        category.limits.all().delete()
        category.yearly_budgets.all().delete()
        category.bills.all().delete()
    if kind == Category.BudgetKind.MONTHLY:
        category.yearly_budgets.all().delete()
        category.bills.all().delete()
        category.limits.filter(month__isnull=True, from_month__gt=first, from_month__lte=year_end).delete()
        before = default_in_effect(defaults_of(category), first)
        if before is None or before.limit_cents != plan_budget.default_cents:
            CategoryLimit.objects.update_or_create(
                category=category, month=None, from_month=first, defaults={"limit_cents": plan_budget.default_cents}
            )
        category.limits.filter(month__gte=first, month__lte=year_end).delete()
        for key, cents in plan_budget.month_cents.items():
            month = int(key)
            if month >= from_month and cents != plan_budget.default_cents:
                CategoryLimit.objects.create(category=category, month=date(year, month, 1), limit_cents=cents)
    elif kind == Category.BudgetKind.BILLS:
        category.limits.all().delete()
        category.yearly_budgets.all().delete()
        for bill in category.bills.filter(from_month__lte=year_end):
            if bill.until_month is not None and bill.until_month < first:
                continue
            if bill.from_month >= first:
                bill.delete()
            else:
                bill.until_month = month_before(first)
                bill.save(update_fields=["until_month", "updated_at"])
        for line in plan_budget.bills.all():
            if line.until_month is not None and line.until_month < from_month:
                continue
            Bill.objects.create(
                category=category, name=line.name, day=line.day, amount_cents=line.amount_cents,
                from_month=date(year, max(line.from_month, from_month), 1),
                until_month=date(year, line.until_month, 1) if line.until_month is not None else None,
            )
    else:
        category.bills.all().delete()
        if category.budget_kind not in YEARLY_KINDS:
            category.limits.all().delete()
        YearlyBudget.objects.update_or_create(
            category=category,
            from_year=year,
            defaults={
                "amount_cents": plan_budget.amount_cents,
                "due_month": plan_budget.due_month if kind == Category.BudgetKind.TARGET else None,
                "due_day": plan_budget.due_day if kind == Category.BudgetKind.TARGET else None,
            },
        )
    if category.budget_kind != kind:
        category.budget_kind = kind
        category.save(update_fields=["budget_kind", "updated_at"])


def _income_changes(plan):
    row = current_plan_row(plan.year)
    current = sorted(
        (l.name, l.amount_cents, l.per, l.category_id, sorted(l.extra.items())) for l in (row.income_lines.all() if row else [])
    )
    draft = sorted((l.name, l.amount_cents, l.per, l.category_id, sorted(l.extra.items())) for l in plan.income_lines.all())
    if current == draft:
        return None
    return {
        "lines": len(draft),
        "from_cents": sum(income_plan_cents(l) for l in (row.income_lines.all() if row else [])),
        "to_cents": sum(income_plan_cents(l) for l in plan.income_lines.all()),
    }


def apply_plan(plan, from_month, today, commit=False):
    """The changes applying `plan` from `from_month` makes, written when
    `commit`. Returns {changes, income, part_spent_cents, nothing_to_apply}."""
    if plan.kind != YearPlan.Kind.DRAFT:
        raise ValueError("Only a draft can be applied.")
    if not 1 <= from_month <= 12:
        raise ValueError("The from month must be 1 to 12.")
    if date(plan.year, from_month, 1) < today.replace(day=1):
        raise ValueError("A month that has passed can't be changed by a plan.")
    loans = loan_categories()
    current = current_budgets(plan.year, today, from_month)
    plan_budgets = list(plan.budgets.select_related("category").prefetch_related("bills"))
    categories = {pb.category_id: pb.category for pb in plan_budgets}
    for category in Category.objects.filter(id__in=categories).prefetch_related("limits", "yearly_budgets", "bills"):
        categories[category.id] = category

    changes = []
    for plan_budget in plan_budgets:
        if plan_budget.category_id in loans:
            continue
        category = categories[plan_budget.category_id]
        change = _change_for(category, current.get(category.id), plan_budget, from_month, plan.year)
        if change is not None:
            changes.append((category, plan_budget, change))
    # Kind switches and removals first, as the preview lists them.
    changes.sort(key=lambda item: (item[2]["kind_switch"] is None and not item[2]["remove"], item[0].name))
    income = _income_changes(plan)

    part_spent = None
    this_month = today.replace(day=1)
    if date(plan.year, from_month, 1) == this_month and changes:
        spent = spent_by_category([c for c, _pb, _ch in changes], this_month, month_range(this_month))
        part_spent = sum(max(v, 0) for v in spent.values())

    result = {
        "from_month": from_month,
        "changes": [change for _c, _pb, change in changes],
        "income": income,
        "part_spent_cents": part_spent,
        "nothing_to_apply": not changes and income is None,
    }
    if not commit:
        return result
    if result["nothing_to_apply"]:
        raise ValueError("This draft matches the budget. Nothing to apply.")
    with transaction.atomic():
        for category, plan_budget, change in changes:
            _write(category, plan_budget, change, from_month, plan.year)
        if income is not None:
            row = current_plan_row(plan.year, create=True)
            row.income_lines.all().delete()
            for line in plan.income_lines.all():
                IncomeLine.objects.create(
                    plan=row, name=line.name, amount_cents=line.amount_cents, per=line.per, extra=dict(line.extra),
                    category_id=line.category_id,
                )
        plan.kind = YearPlan.Kind.APPLIED
        plan.from_month = from_month
        plan.applied_at = timezone.now()
        plan.save(update_fields=["kind", "from_month", "applied_at", "updated_at"])
    return result

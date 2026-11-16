"""The year plans API - see openspec/specs/year-plans.

Current is addressed by year (`plans/current/<year>/`), since it isn't stored:
only its income lines are, in the year's "current" YearPlan row. Drafts and
applied plans are addressed by id.
"""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from forecasting.models import ExpectedItem
from transactions.loans import sync_loans

from . import utils
from .apply import apply_plan
from .loan_categories import loan_categories
from .models import Category, IncomeLine, PlanBudget, YearPlan
from .plan_edits import (
    PlanError,
    check_editable,
    create_draft,
    remove_budget,
    set_bills,
    set_budget,
    use_current,
)
from .plans import YEARLY_KINDS, add_months, budgeted_categories, current_plan_row, spent_by_category, year_view
from .utils import parse_due

KINDS = {"monthly", "yearly", "target", "bills"}


def plan_meta(plan):
    return {
        "id": plan.id,
        "year": plan.year,
        "kind": plan.kind,
        "name": plan.name,
        "from_month": plan.from_month,
        "copied_at": plan.copied_at,
        "applied_at": plan.applied_at,
        "updated_at": plan.updated_at,
    }


def first_year():
    """The first year with transactions or budgets, for the year switcher."""
    from transactions.models import Transaction

    from .models import Bill, CategoryLimit, YearlyBudget

    years = []
    first_txn = Transaction.objects.order_by("date").values_list("date", flat=True).first()
    if first_txn:
        years.append(first_txn.year)
    first_yearly = YearlyBudget.objects.order_by("from_year").values_list("from_year", flat=True).first()
    if first_yearly:
        years.append(first_yearly)
    first_bill = Bill.objects.order_by("from_month").values_list("from_month", flat=True).first()
    if first_bill:
        years.append(first_bill.year)
    if CategoryLimit.objects.exists() and not years:
        years.append(utils.today().year)
    return min(years) if years else utils.today().year


def _year(value):
    try:
        year = int(value)
    except (TypeError, ValueError):
        raise PlanError("Give the year, such as 2027.")
    if not 2000 <= year <= 2100:
        raise PlanError("Give the year, such as 2027.")
    return year


def _int(value, name, minimum=None, maximum=None, required=True):
    if value is None:
        if required:
            raise PlanError(f"{name} is required.")
        return None
    if not isinstance(value, int) or isinstance(value, bool):
        raise PlanError(f"{name} must be a whole number.")
    if (minimum is not None and value < minimum) or (maximum is not None and value > maximum):
        raise PlanError(f"{name} is out of range.")
    return value


def refused(exc):
    return Response({"detail": str(exc)}, status=400)


class PlanListView(APIView):
    """GET ?year=Y: the year's chips. POST: a new draft."""

    def get(self, request):
        try:
            year = _year(request.query_params.get("year"))
        except PlanError as exc:
            return refused(exc)
        today = utils.today()
        plans = list(YearPlan.objects.filter(year=year).exclude(kind=YearPlan.Kind.CURRENT))
        return Response(
            {
                "year": year,
                "first_year": first_year(),
                "last_year": today.year + 1,
                "can_draft": year >= today.year,
                "drafts": [plan_meta(p) for p in plans if p.kind == YearPlan.Kind.DRAFT],
                "history": [
                    plan_meta(p)
                    for p in sorted(
                        (p for p in plans if p.kind == YearPlan.Kind.APPLIED), key=lambda p: p.applied_at, reverse=True
                    )
                ],
            }
        )

    def post(self, request):
        """{year, copy_of: id (else Current), name, from_month}."""
        today = utils.today()
        try:
            year = _year(request.data.get("year"))
            source = None
            if request.data.get("copy_of") is not None:
                source = YearPlan.objects.exclude(kind=YearPlan.Kind.CURRENT).filter(
                    id=request.data["copy_of"], year=year
                ).first()
                if source is None:
                    return Response({"copy_of": "No such plan this year."}, status=400)
            from_month = _int(request.data.get("from_month"), "from_month", 1, 12, required=False)
            if from_month is not None and year == today.year and from_month < today.month:
                raise PlanError("A draft can't start in a month that has passed.")
            name = (request.data.get("name") or "").strip() or None
            with transaction.atomic():
                plan = create_draft(year, today, source, name, from_month)
        except PlanError as exc:
            return refused(exc)
        return Response(plan_meta(plan), status=201)


def _loans_by_category():
    from .views import loans_by_category

    return loans_by_category()


def _view(year, plan=None):
    today = utils.today()
    sync_loans(today)
    view = year_view(year, today, plan)
    loans = _loans_by_category()
    for row in view["rows"]:
        row["loans"] = loans.get(row["category_id"], [])
    return view


class CurrentPlanView(APIView):
    """GET: Current's year view for <year>."""

    def get(self, request, year):
        return Response({"plan": {"id": None, "year": year, "kind": "current", "name": "Current budget"},
                         **_view(year)})


class PlanBase(APIView):
    def get_plan(self, pk):
        return get_object_or_404(YearPlan.objects.exclude(kind=YearPlan.Kind.CURRENT), pk=pk)


class PlanCategoryBase(PlanBase):
    def get_category(self, category_id):
        return get_object_or_404(budgeted_categories(), pk=category_id)

    def _guard(self, plan, category, today):
        check_editable(plan, today)
        if category.id in loan_categories():
            raise PlanError("Its loans set this budget. Change it on the loan.")


class PlanDetailView(PlanBase):
    def get(self, request, pk):
        plan = self.get_plan(pk)
        return Response({"plan": plan_meta(plan), **_view(plan.year, plan)})

    def patch(self, request, pk):
        """{name, from_month}."""
        plan = self.get_plan(pk)
        today = utils.today()
        try:
            if "from_month" in request.data:
                check_editable(plan, today)
                from_month = _int(request.data["from_month"], "from_month", 1, 12)
                if plan.year == today.year and from_month < today.month:
                    raise PlanError("A draft can't start in a month that has passed.")
                plan.from_month = from_month
            if "name" in request.data:
                name = (request.data["name"] or "").strip()
                if not name:
                    raise PlanError("Give the plan a name.")
                plan.name = name[:255]
        except PlanError as exc:
            return refused(exc)
        plan.save()
        return Response(plan_meta(plan))

    def delete(self, request, pk):
        plan = self.get_plan(pk)
        if plan.kind != YearPlan.Kind.DRAFT:
            return refused(PlanError("An applied plan is kept as a record."))
        plan.delete()
        return Response(status=204)


class PlanDuplicateView(PlanBase):
    def post(self, request, pk):
        plan = self.get_plan(pk)
        today = utils.today()
        try:
            with transaction.atomic():
                copy = create_draft(
                    plan.year, today, plan, name=f"{plan.name} (copy)",
                    from_month=max(plan.from_month, today.month) if plan.year == today.year else plan.from_month,
                )
        except PlanError as exc:
            return refused(exc)
        return Response(plan_meta(copy), status=201)


class PlanCategoryView(PlanCategoryBase):
    """A draft's budget for one category: PUT sets it, DELETE removes it."""

    def put(self, request, pk, category_id):
        plan = self.get_plan(pk)
        category = self.get_category(category_id)
        today = utils.today()
        try:
            self._guard(plan, category, today)
            kind = request.data.get("kind")
            if kind not in KINDS:
                raise PlanError("Must be monthly, yearly, target or bills.")
            due = None
            if kind == "target":
                try:
                    due = parse_due(request.data.get("due") or "")
                except ValueError as exc:
                    raise PlanError(str(exc))
            months = request.data.get("months") or {}
            if not isinstance(months, dict):
                raise PlanError("months must map months to amounts.")
            for key, cents in months.items():
                if not str(key).isdigit() or not 1 <= int(key) <= 12:
                    raise PlanError("months must map months 1-12 to amounts.")
                _int(cents, "A month's amount", 0, required=False)
            with transaction.atomic():
                set_budget(
                    plan, category, today, kind,
                    default_cents=_int(request.data.get("default_cents"), "default_cents", 0, required=False),
                    months=months,
                    amount_cents=_int(request.data.get("amount_cents"), "amount_cents", 0, required=False),
                    due=due,
                )
        except PlanError as exc:
            return refused(exc)
        return Response({"plan": plan_meta(plan)})

    def delete(self, request, pk, category_id):
        plan = self.get_plan(pk)
        category = self.get_category(category_id)
        today = utils.today()
        try:
            self._guard(plan, category, today)
            with transaction.atomic():
                remove_budget(plan, category, today)
        except PlanError as exc:
            return refused(exc)
        return Response({"plan": plan_meta(plan)})


class PlanBillsView(PlanCategoryBase):
    def put(self, request, pk, category_id):
        """{bills: [{name, day, amount_cents, from_month, until_month}]}."""
        plan = self.get_plan(pk)
        category = self.get_category(category_id)
        today = utils.today()
        try:
            self._guard(plan, category, today)
            lines = request.data.get("bills")
            if not isinstance(lines, list):
                raise PlanError("bills must be a list.")
            clean = []
            for line in lines:
                name = (line.get("name") or "").strip()
                if not name:
                    raise PlanError("Every bill needs a name.")
                clean.append({
                    "name": name[:255],
                    "day": _int(line.get("day"), "A bill's day", 1, 31),
                    "amount_cents": _int(line.get("amount_cents"), "A bill's amount", 1),
                    "from_month": _int(line.get("from_month"), "A bill's first month", 1, 12, required=False),
                    "until_month": _int(line.get("until_month"), "A bill's last month", 1, 12, required=False),
                })
            with transaction.atomic():
                set_bills(plan, category, today, clean)
        except PlanError as exc:
            return refused(exc)
        return Response({"plan": plan_meta(plan)})


class PlanUseCurrentView(PlanCategoryBase):
    def post(self, request, pk, category_id):
        plan = self.get_plan(pk)
        category = self.get_category(category_id)
        today = utils.today()
        try:
            self._guard(plan, category, today)
            with transaction.atomic():
                use_current(plan, category, today)
        except PlanError as exc:
            return refused(exc)
        return Response({"plan": plan_meta(plan)})


class PlanAddCategoryView(PlanBase):
    """POST {name, parent}: a real category without a budget, made from a
    draft - see "Adding a category from a plan"."""

    def post(self, request, pk):
        from .serializers import CategorySerializer

        plan = self.get_plan(pk)
        try:
            check_editable(plan, utils.today())
        except PlanError as exc:
            return refused(exc)
        serializer = CategorySerializer(data={"name": request.data.get("name"), "parent": request.data.get("parent")},
                                        context={"request": request, "loans": {}})
        serializer.is_valid(raise_exception=True)
        category = serializer.save()
        # Listed in the draft straight away, without a budget yet.
        PlanBudget.objects.create(plan=plan, category=category, kind=PlanBudget.NONE)
        return Response(CategorySerializer(category, context={"request": request, "loans": {}}).data, status=201)


class PlanApplyView(PlanBase):
    """GET ?from=M: the preview. POST {from_month}: apply."""

    def _from(self, plan, value):
        try:
            return int(value) if value is not None else plan.from_month
        except (TypeError, ValueError):
            raise PlanError("from must be a month, 1 to 12.")

    def get(self, request, pk):
        plan = self.get_plan(pk)
        today = utils.today()
        try:
            from_month = self._from(plan, request.query_params.get("from"))
            result = apply_plan(plan, from_month, today)
        except (PlanError, ValueError) as exc:
            return refused(exc)
        return Response({**result, "changed_since_copy": _changed_since_copy(plan)})

    def post(self, request, pk):
        plan = self.get_plan(pk)
        today = utils.today()
        try:
            from_month = self._from(plan, request.data.get("from_month"))
            result = apply_plan(plan, from_month, today, commit=True)
        except (PlanError, ValueError) as exc:
            return refused(exc)
        return Response({**result, "plan": plan_meta(plan)})


def _changed_since_copy(plan):
    view = year_view(plan.year, utils.today(), plan)
    return [
        {"category_id": r["category_id"], "category_name": r["category_name"], **r["changed_since_copy"],
         "draft_cents": r["default_cents"] if r["kind"] == "monthly" else r["amount_cents"] if r["kind"] in YEARLY_KINDS else r["plan_cents"]}
        for r in view["rows"]
        if r["changed_since_copy"]
    ]


# -- Income lines -------------------------------------------------------------


def _income_plan(pk, year):
    """The plan whose income lines a route edits: a draft by id, or the
    year's Current row (made on first use)."""
    if pk is None:
        return current_plan_row(year, create=True)
    plan = get_object_or_404(YearPlan.objects.exclude(kind=YearPlan.Kind.CURRENT), pk=pk)
    check_editable(plan, utils.today())
    return plan


def _clean_line(data, partial=False):
    clean = {}
    if not partial or "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            raise PlanError("Give the income a name.")
        clean["name"] = name[:255]
    if not partial or "amount_cents" in data:
        clean["amount_cents"] = _int(data.get("amount_cents"), "amount_cents", 0)
    if not partial or "per" in data:
        per = data.get("per") or "month"
        if per not in ("month", "year"):
            raise PlanError("per must be month or year.")
        clean["per"] = per
    if not partial or "extra" in data:
        extra = data.get("extra") or {}
        if not isinstance(extra, dict):
            raise PlanError("extra must map months to amounts.")
        cleaned = {}
        for key, cents in extra.items():
            if not str(key).isdigit() or not 1 <= int(key) <= 12:
                raise PlanError("extra must map months 1-12 to amounts.")
            if cents:
                cleaned[str(int(key))] = _int(cents, "An extra amount", 0)
        clean["extra"] = cleaned
    if not partial or "category" in data:
        category_id = data.get("category")
        if category_id is not None:
            category = budgeted_categories().filter(pk=category_id).first()
            if category is None:
                raise PlanError("No such category.")
            clean["category_id"] = category.id
        else:
            clean["category_id"] = None
    return clean


class IncomeListView(APIView):
    """POST: add an income line to a draft (pk) or to Current (year)."""

    def post(self, request, pk=None, year=None):
        try:
            plan = _income_plan(pk, year)
            line = IncomeLine.objects.create(plan=plan, **_clean_line(request.data))
        except PlanError as exc:
            return refused(exc)
        if plan.kind == YearPlan.Kind.DRAFT:
            plan.save(update_fields=["updated_at"])
        return Response({"id": line.id}, status=201)


class IncomeDetailView(APIView):
    def _line(self, pk, year, line_id):
        plan = _income_plan(pk, year)
        return get_object_or_404(IncomeLine.objects.filter(plan=plan), pk=line_id), plan

    def patch(self, request, line_id, pk=None, year=None):
        try:
            line, plan = self._line(pk, year, line_id)
            for key, value in _clean_line(request.data, partial=True).items():
                setattr(line, key, value)
        except PlanError as exc:
            return refused(exc)
        line.save()
        return Response({"id": line.id})

    def delete(self, request, line_id, pk=None, year=None):
        try:
            line, _plan = self._line(pk, year, line_id)
        except PlanError as exc:
            return refused(exc)
        line.delete()
        return Response(status=204)


class IncomeSuggestionsView(APIView):
    """GET ?year=Y: lines to suggest for an empty Income section - see
    "Income suggestions"."""

    def get(self, request):
        today = utils.today()
        suggestions = []
        covered = set()
        categories = list(budgeted_categories())
        parents = {c.id: c.parent_id for c in categories}
        for item in ExpectedItem.objects.filter(direction=ExpectedItem.Direction.IN).select_related("category"):
            suggestions.append({
                "name": item.name, "amount_cents": item.amount_cents, "per": "month",
                "category": item.category_id, "source": "forecast",
            })
            if item.category_id is not None:
                covered.add(item.category_id)
                if parents.get(item.category_id):
                    covered.add(parents[item.category_id])
        this_month = today.replace(day=1)
        spent = spent_by_category(categories, add_months(this_month, -12), this_month)
        for category in categories:
            if category.parent_id is not None or category.id in covered:
                continue
            subs = [c.id for c in categories if c.parent_id == category.id]
            if any(sub in covered for sub in subs):
                continue
            inflow = -(spent.get(category.id, 0) + sum(spent.get(sub, 0) for sub in subs))
            if inflow > 0:
                suggestions.append({
                    "name": category.name, "amount_cents": inflow, "per": "year",
                    "category": category.id, "source": "last_12",
                })
        return Response({"suggestions": suggestions})

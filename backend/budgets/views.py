from django.db import transaction
from django.db.models import Count
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from reports.spending import month_spending

from . import utils
from .attention import attention_bills, attention_categories, attention_yearly
from .loan_categories import active_loans, loan_categories
from .models import Bill, BudgetSettings, Category, CategoryLimit, YearlyBudget
from .serializers import CategorySerializer
from .summary import budget_rows, budget_totals, uncategorized_spent, yearly_spent_cents
from .yearly import yearly_rows
from .utils import parse_due, parse_month

YEARLY_KINDS = {Category.BudgetKind.YEARLY, Category.BudgetKind.TARGET}

# A loan's payment category takes its budget from the loans - see
# openspec/specs/bill-budgets.
LOAN_SET = "Its loans set this budget. Change it on the loan."


def loans_by_category():
    """{category id: [{account_id, name}]} for loans on active accounts."""
    result = {}
    for loan in active_loans().exclude(payment_category=None).select_related("account").order_by("account__name"):
        result.setdefault(loan.payment_category_id, []).append({"account_id": loan.account_id, "name": loan.account.name})
    return result


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer

    def get_queryset(self):
        return (
            Category.objects.select_related("parent")
            .prefetch_related("yearly_budgets", "limits", "bills")
            .annotate(transaction_count=Count("transactions"))
        )

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "loans": loans_by_category()}

    def destroy(self, request, *args, **kwargs):
        category = self.get_object()
        subcategory_count = category.subcategories.count()
        if subcategory_count:
            return Response(
                {
                    "detail": (
                        f"{subcategory_count} subcategory/subcategories are still "
                        "nested under this category. Remove or re-parent them "
                        "before deleting it."
                    )
                },
                status=400,
            )
        transaction_count = category.transactions.count()
        if transaction_count:
            return Response(
                {
                    "detail": (
                        f"{transaction_count} transaction(s) are still assigned to this "
                        "category. Reassign them to another category or to "
                        "uncategorized before deleting it."
                    )
                },
                status=400,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=["put"], url_path="limit")
    def set_limit(self, request, pk=None):
        """Set the default limit (month omitted/null) or a specific
        month's override (month="YYYY-MM") for this category."""
        category = self.get_object()
        if category.is_tab_group or category.is_tab:
            return Response({"detail": "Tabs aren't budgeted, so they take no limit."}, status=400)
        if category.id in loan_categories():
            return Response({"detail": LOAN_SET}, status=400)
        if category.budget_kind == Category.BudgetKind.BILLS:
            return Response({"detail": "This category has bills, so it takes no monthly limit."}, status=400)
        if category.budget_kind != Category.BudgetKind.MONTHLY:
            return Response({"detail": "This category has a yearly budget, so it takes no monthly limit."}, status=400)
        limit_cents = request.data.get("limit_cents")
        if limit_cents is None:
            return Response({"limit_cents": "This field is required."}, status=400)
        try:
            month = parse_month(request.data.get("month"))
        except ValueError as exc:
            return Response({"month": str(exc)}, status=400)

        limit, _created = CategoryLimit.objects.update_or_create(
            category=category, month=month, defaults={"limit_cents": limit_cents}
        )
        return Response(
            {
                "month": month.isoformat()[:7] if month else None,
                "limit_cents": limit.limit_cents,
            }
        )

    @action(detail=True, methods=["put"], url_path="budget")
    def set_budget(self, request, pk=None):
        """Set a category's kind and amount in one go: {kind, amount_cents,
        due: "MM-DD"}. Switching to or from monthly removes the other
        side's amounts; switching between the yearly kinds keeps the
        amount and history. A yearly amount applies from the current year
        on - see openspec/specs/yearly-budgets. Bills takes no amount: its
        bills are set with PUT .../bills/."""
        category = self.get_object()
        if category.is_tab_group or category.is_tab:
            return Response({"detail": "Tabs aren't budgeted, so they take no budget."}, status=400)
        if category.id in loan_categories():
            return Response({"detail": LOAN_SET}, status=400)
        kind = request.data.get("kind")
        if kind not in Category.BudgetKind.values:
            return Response({"kind": "Must be monthly, yearly, target or bills."}, status=400)
        amount_cents = request.data.get("amount_cents")
        if amount_cents is not None and (not isinstance(amount_cents, int) or amount_cents < 0):
            return Response({"amount_cents": "Must be a whole number of cents, 0 or more."}, status=400)
        due = (None, None)
        if kind in YEARLY_KINDS and amount_cents is None:
            return Response({"amount_cents": "A yearly budget needs an amount."}, status=400)
        if kind == Category.BudgetKind.TARGET:
            if not request.data.get("due"):
                return Response({"due": "A yearly budget on a date needs a due date."}, status=400)
            try:
                due = parse_due(request.data["due"])
            except ValueError as exc:
                return Response({"due": str(exc)}, status=400)

        with transaction.atomic():
            # Bills belong to the Bills kind only; any other kind's amounts
            # go when switching to Bills - see openspec/specs/bill-budgets.
            if kind != Category.BudgetKind.BILLS:
                category.bills.all().delete()
            if kind == Category.BudgetKind.BILLS:
                category.limits.all().delete()
                category.yearly_budgets.all().delete()
            elif kind == Category.BudgetKind.MONTHLY:
                category.yearly_budgets.all().delete()
                if amount_cents is not None:
                    CategoryLimit.objects.update_or_create(
                        category=category, month=None, defaults={"limit_cents": amount_cents}
                    )
            else:
                if category.budget_kind == Category.BudgetKind.MONTHLY:
                    category.limits.all().delete()
                YearlyBudget.objects.update_or_create(
                    category=category,
                    from_year=utils.today().year,
                    defaults={"amount_cents": amount_cents, "due_month": due[0], "due_day": due[1]},
                )
            category.budget_kind = kind
            category.save(update_fields=["budget_kind", "updated_at"])

        return Response(CategorySerializer(self.get_queryset().get(pk=category.pk), context=self.get_serializer_context()).data)

    @action(detail=True, methods=["put"], url_path="bills")
    def set_bills(self, request, pk=None):
        """Replace a Bills category's bills: {bills: [{id?, name, day,
        amount_cents}]}. A line with an id updates that bill and keeps the
        month it counts from; a new line counts from the current month;
        bills left out are deleted - see openspec/specs/bill-budgets."""
        category = self.get_object()
        if category.id in loan_categories():
            return Response({"detail": LOAN_SET}, status=400)
        if category.budget_kind != Category.BudgetKind.BILLS:
            return Response({"detail": "Only a Bills category takes bills."}, status=400)
        lines = request.data.get("bills")
        if not isinstance(lines, list):
            return Response({"bills": "Must be a list of bills."}, status=400)
        errors, cleaned = self._clean_bills(category, lines)
        if errors:
            return Response({"bills": errors}, status=400)

        this_month = utils.today().replace(day=1)
        with transaction.atomic():
            keep = {line["id"] for line in cleaned if line["id"] is not None}
            category.bills.exclude(id__in=keep).delete()
            for line in cleaned:
                values = {"name": line["name"], "day": line["day"], "amount_cents": line["amount_cents"]}
                if line["id"] is None:
                    Bill.objects.create(category=category, from_month=this_month, **values)
                else:
                    Bill.objects.filter(id=line["id"]).update(**values)
        return Response(CategorySerializer(self.get_queryset().get(pk=category.pk), context=self.get_serializer_context()).data)

    @staticmethod
    def _clean_bills(category, lines):
        existing = set(category.bills.values_list("id", flat=True))
        errors, cleaned = [], []
        for line in lines:
            line = line if isinstance(line, dict) else {}
            error = {}
            name = str(line.get("name") or "").strip()
            day, amount, bill_id = line.get("day"), line.get("amount_cents"), line.get("id")
            if not name:
                error["name"] = "A bill needs a name."
            if not isinstance(day, int) or isinstance(day, bool) or not 1 <= day <= 31:
                error["day"] = "Must be a day from 1 to 31."
            if not isinstance(amount, int) or isinstance(amount, bool) or amount <= 0:
                error["amount_cents"] = "Must be a whole number of cents above 0."
            if bill_id is not None and bill_id not in existing:
                error["id"] = "Not a bill of this category."
            errors.append(error)
            cleaned.append({"id": bill_id, "name": name, "day": day, "amount_cents": amount})
        return ([e for e in errors] if any(errors) else []), cleaned


class BudgetSummaryView(APIView):
    def get(self, request):
        month_param = request.query_params.get("month")
        if not month_param:
            return Response({"detail": "month query param (YYYY-MM) is required."}, status=400)
        try:
            period_start = parse_month(month_param)
            if period_start is None:
                raise ValueError(month_param)
        except ValueError:
            return Response({"detail": "month must be in YYYY-MM format."}, status=400)
        today = utils.today()
        current = period_start == today.replace(day=1)
        days_in_month = (utils.month_range(period_start) - period_start).days
        pace = today.day / days_in_month if current else None
        rows = budget_rows(period_start, today)
        yearly = yearly_rows(period_start, today)
        yearly_spent = yearly_spent_cents(period_start)
        _, uncategorized_cents = month_spending(period_start)
        return Response(
            {
                "month": month_param,
                "categories": rows,
                "uncategorized_spent_cents": uncategorized_spent(period_start),
                "yearly_spent_cents": yearly_spent,
                "yearly": yearly,
                # The same figures and warnings as the overview's budget tile.
                "totals": {
                    **budget_totals(rows, pace),
                    "yearly_spent_cents": yearly_spent,
                    "uncategorized_cents": uncategorized_cents,
                },
                "pace": pace,
                "days_left": days_in_month - today.day + 1 if current else None,
                "attention": {
                    "categories": attention_categories(rows, pace),
                    "yearly": attention_yearly(yearly, current),
                    "bills": attention_bills(rows),
                },
            }
        )


def _format_month(value):
    return value.isoformat()[:7] if value else None


class BudgetSettingsView(APIView):
    """The budgeting start month: {start_month: "YYYY-MM" | null} - see
    openspec/specs/yearly-budgets."""

    def get(self, request):
        return Response({"start_month": _format_month(BudgetSettings.load().start_month)})

    def put(self, request):
        try:
            start_month = parse_month(request.data.get("start_month"))
        except ValueError as exc:
            return Response({"start_month": str(exc)}, status=400)
        settings = BudgetSettings.load()
        settings.start_month = start_month
        settings.save()
        return Response({"start_month": _format_month(start_month)})

from django.db import transaction
from django.db.models import Count
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from . import utils
from .models import BudgetSettings, Category, CategoryLimit, YearlyBudget
from .serializers import CategorySerializer
from .summary import budget_rows, uncategorized_spent
from .yearly import yearly_rows, yearly_spent_cents
from .utils import parse_due, parse_month

YEARLY_KINDS = {Category.BudgetKind.YEARLY, Category.BudgetKind.TARGET}


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = (
        Category.objects.select_related("parent")
        .prefetch_related("yearly_budgets", "limits")
        .annotate(transaction_count=Count("transactions"))
    )
    serializer_class = CategorySerializer

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
        on - see openspec/specs/yearly-budgets."""
        category = self.get_object()
        if category.is_tab_group or category.is_tab:
            return Response({"detail": "Tabs aren't budgeted, so they take no budget."}, status=400)
        kind = request.data.get("kind")
        if kind not in Category.BudgetKind.values:
            return Response({"kind": "Must be monthly, yearly or target."}, status=400)
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
            if kind == Category.BudgetKind.MONTHLY:
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

        return Response(CategorySerializer(self.get_queryset().get(pk=category.pk)).data)


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
        return Response(
            {
                "month": month_param,
                "categories": budget_rows(period_start),
                "uncategorized_spent_cents": uncategorized_spent(period_start),
                "yearly_spent_cents": yearly_spent_cents(period_start),
                "yearly": yearly_rows(period_start, utils.today()),
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

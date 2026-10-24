from django.db.models import Count
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Category, CategoryLimit
from .serializers import CategorySerializer
from .summary import budget_rows, uncategorized_spent
from .utils import parse_month


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.select_related("parent").annotate(transaction_count=Count("transactions"))
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
            }
        )

from django.db.models import Count, Sum
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from transactions.models import Transaction

from .models import Category, CategoryLimit
from .serializers import CategorySerializer
from .utils import month_range, parse_month


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
        period_end = month_range(period_start)

        categories = []
        # Tab groups and tabs aren't budgeted - see openspec/specs/repayment-tabs.
        budgeted = Category.objects.filter(is_tab_group=False).exclude(parent__is_tab_group=True)
        for category in budgeted:
            spent = (
                category.transactions.filter(date__gte=period_start, date__lt=period_end)
                .aggregate(total=Sum("amount_cents"))["total"]
                or 0
            )
            spent_cents = -spent

            override = category.limits.filter(month=period_start).first()
            default = category.limits.filter(month__isnull=True).first()
            limit = override or default
            limit_cents = limit.limit_cents if limit else None

            remaining_cents = limit_cents - spent_cents if limit_cents is not None else None
            over_limit = limit_cents is not None and spent_cents > limit_cents

            categories.append(
                {
                    "category_id": category.id,
                    "category_name": category.name,
                    "parent_id": category.parent_id,
                    "limit_cents": limit_cents,
                    "spent_cents": spent_cents,
                    "remaining_cents": remaining_cents,
                    "over_limit": over_limit,
                }
            )

        uncategorized_spent = (
            Transaction.objects.counted_rows()  # a split counts through its parts
            .filter(
                category__isnull=True,
                transfer_counterpart__isnull=True,  # transfers aren't spending
                date__gte=period_start,
                date__lt=period_end,
            ).aggregate(total=Sum("amount_cents"))["total"]
            or 0
        )

        return Response(
            {
                "month": month_param,
                "categories": categories,
                "uncategorized_spent_cents": -uncategorized_spent,
            }
        )

from datetime import date

from django.db.models import BigIntegerField, Case, Sum, When
from django.db.models.functions import TruncMonth
from rest_framework.response import Response
from rest_framework.views import APIView

from budgets.models import Category
from budgets.utils import month_range, parse_month
from transactions.models import Transaction

CASH_FLOW_MONTHS = 12


def _month_param(request, name):
    """Parse a required YYYY-MM query param; returns (date, error_response)."""
    value = request.query_params.get(name)
    if not value:
        return None, Response({"detail": f"{name} query param (YYYY-MM) is required."}, status=400)
    try:
        month = parse_month(value)
        if month is None:
            raise ValueError(value)
    except ValueError:
        return None, Response({"detail": f"{name} must be in YYYY-MM format."}, status=400)
    return month, None


def _shift_months(month, delta):
    index = month.year * 12 + (month.month - 1) + delta
    return date(index // 12, index % 12 + 1, 1)


def _active_transactions():
    return Transaction.objects.filter(account__archived=False)


class CashFlowView(APIView):
    """Money in vs money out per month, for the 12 months ending at `end`."""

    def get(self, request):
        end, error = _month_param(request, "end")
        if error:
            return error
        start = _shift_months(end, -(CASH_FLOW_MONTHS - 1))

        rows = (
            _active_transactions()
            .filter(date__gte=start, date__lt=month_range(end))
            .annotate(month=TruncMonth("date"))
            .values("month")
            .annotate(
                money_in=Sum(
                    Case(When(amount_cents__gt=0, then="amount_cents"), default=0, output_field=BigIntegerField())
                ),
                money_out=Sum(
                    Case(When(amount_cents__lt=0, then="amount_cents"), default=0, output_field=BigIntegerField())
                ),
            )
        )
        totals = {row["month"]: row for row in rows}

        months = []
        for i in range(CASH_FLOW_MONTHS):
            month = _shift_months(start, i)
            row = totals.get(month, {})
            months.append(
                {
                    "month": month.strftime("%Y-%m"),
                    "in_cents": row.get("money_in") or 0,
                    "out_cents": -(row.get("money_out") or 0),
                }
            )
        return Response({"months": months})


class CategorySpendingView(APIView):
    """Net outflow per category for one month, subcategories rolled into
    their parent. Refunds reduce a category's spending; uncategorized
    spending counts outflows only, since uncategorized inflows are
    usually income."""

    def get(self, request):
        month, error = _month_param(request, "month")
        if error:
            return error
        in_month = _active_transactions().filter(date__gte=month, date__lt=month_range(month))

        spent = {
            row["category_id"]: -row["net"]
            for row in in_month.filter(category__isnull=False)
            .values("category_id")
            .annotate(net=Sum("amount_cents"))
        }
        uncategorized = -(
            in_month.filter(category__isnull=True, amount_cents__lt=0).aggregate(total=Sum("amount_cents"))[
                "total"
            ]
            or 0
        )

        categories = list(Category.objects.all())
        children = {}
        for c in categories:
            if c.parent_id is not None:
                children.setdefault(c.parent_id, []).append(c)

        result = []
        for parent in (c for c in categories if c.parent_id is None):
            direct = spent.get(parent.id, 0)
            subs = [
                {"category_id": c.id, "name": c.name, "spent_cents": spent.get(c.id, 0)}
                for c in children.get(parent.id, [])
            ]
            total = direct + sum(s["spent_cents"] for s in subs)
            if total <= 0:
                continue
            result.append(
                {
                    "category_id": parent.id,
                    "name": parent.name,
                    "spent_cents": total,
                    "direct_cents": direct,
                    "subcategories": sorted(
                        (s for s in subs if s["spent_cents"] > 0), key=lambda s: -s["spent_cents"]
                    ),
                }
            )
        result.sort(key=lambda r: -r["spent_cents"])

        return Response(
            {"month": month.strftime("%Y-%m"), "categories": result, "uncategorized_cents": uncategorized}
        )

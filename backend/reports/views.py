from datetime import timedelta

from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from budgets.models import Category
from budgets.utils import month_range, parse_month
from forecasting.forecast import everyday_forecast, net_worth_forecast
from transactions.covered import account_label
from transactions.loans import sync_loans

from .balances import PROJECTION_DAYS, daily_balances, history_tier, month_end_balances
from .overview import category_label, month_overview
from .report import months_in, spending_cell, spending_report
from .spending import month_spending

UNCATEGORIZED = "uncategorized"


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


class CategorySpendingView(APIView):
    """Net outflow per category for one month, subcategories rolled into
    their parent. Refunds reduce a category's spending; uncategorized
    spending counts outflows only, since uncategorized inflows are
    usually income."""

    def get(self, request):
        month, error = _month_param(request, "month")
        if error:
            return error
        spent, uncategorized = month_spending(month)

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


def _today():
    """Today's date; a function so tests can freeze it."""
    return timezone.localdate()


def _projection(today):
    """The Everyday forecast over the next 30 days, as (points, lowest,
    has_income), or no points with nothing forecast - see
    openspec/specs/balance-history and forecasting."""
    forecast = everyday_forecast(today, PROJECTION_DAYS)
    if not forecast["items"]:
        return None, None, forecast["has_income"]
    return forecast["points"], forecast["lowest"], forecast["has_income"]


class EverydayBalanceView(APIView):
    """The everyday balance per day up to the chosen month's end, or today
    and the projection after it - see openspec/specs/balance-history."""

    def get(self, request):
        month, error = _month_param(request, "month")
        if error:
            return error
        today = _today()
        sync_loans(today)
        current = month == today.replace(day=1)
        end = min(month_range(month) - timedelta(days=1), today)
        tier = history_tier()
        points, lowest, has_income = _projection(today) if current else (None, None, False)
        return Response(
            {
                "tier": tier,
                "current": current,
                "end": end,
                "points": daily_balances(tier, end),
                "projection": points,
                "lowest": lowest,
                "has_income": has_income,
            }
        )


class NetWorthView(APIView):
    """Every account's balance per tier at each month's end - see
    openspec/specs/balance-history."""

    def get(self, request):
        today = _today()
        sync_loans(today)
        # The next 12 months of the net worth forecast, after the current
        # month, which the history already reports - see balance-history.
        forecast = net_worth_forecast(today, 12)
        projection = None if forecast["empty"] else forecast["months"][1:]
        return Response({"months": month_end_balances(today), "projection": projection})


MAX_REPORT_MONTHS = 24


class SpendingReportView(APIView):
    """A profit and loss per month per category for a period of whole
    months - see openspec/specs/spending-report."""

    def get(self, request):
        start, error = _month_param(request, "start")
        if error:
            return error
        end, error = _month_param(request, "end")
        if error:
            return error
        today = _today()
        if end < start or end > today.replace(day=1):
            return Response({"detail": "The period must end on or after its start, and not past this month."}, status=400)
        if len(months_in(start, end)) > MAX_REPORT_MONTHS:
            return Response({"detail": f"A period can be at most {MAX_REPORT_MONTHS} months."}, status=400)
        return Response(spending_report(start, end, today))


class SpendingCellView(APIView):
    """The rows behind one figure of the report: `category` (an id, or
    "uncategorized") in `month`, with `direct=1` for a parent's own rows
    and `income=1` for a figure of money in."""

    def get(self, request):
        month, error = _month_param(request, "month")
        if error:
            return error
        value = request.query_params.get("category")
        if not value:
            return Response({"detail": "category query param is required."}, status=400)
        direct = request.query_params.get("direct") == "1"
        income = request.query_params.get("income") == "1"
        category = None
        name = "Uncategorized income" if income else "Uncategorized"
        if value != UNCATEGORIZED:
            try:
                category = Category.objects.get(pk=value)
            except (Category.DoesNotExist, ValueError):
                return Response({"detail": "Category not found."}, status=404)
            name = f"{category.name} (direct)" if direct else category.name

        rows = list(spending_cell(month, category, direct, income))
        total = sum(r.amount_cents for r in rows)
        return Response(
            {
                "month": month.strftime("%Y-%m"),
                "name": name,
                "uncategorized": category is None,
                "total_cents": total if income else -total,
                "accounts": sorted({account_label(r)[0] for r in rows}),
                "rows": [
                    {
                        "id": r.id,
                        "date": r.date,
                        "payee": r.payee,
                        "amount_cents": r.amount_cents,
                        "account_id": r.account_id,
                        "account_name": account_label(r)[0],
                        "paid_by_tab": account_label(r)[1],
                        "category": r.category_id,
                        "category_label": category_label(r.category),
                        "split_amount_cents": r.split_parent.amount_cents if r.split_parent_id else None,
                    }
                    for r in rows
                ],
            }
        )


class OverviewView(APIView):
    """Every figure the overview shows for one month across all active
    accounts, in one request - see openspec/specs/overview."""

    def get(self, request):
        month, error = _month_param(request, "month")
        if error:
            return error
        today = _today()
        sync_loans(today)
        return Response(month_overview(month, today))

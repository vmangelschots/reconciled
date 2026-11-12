from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account, tier_position
from budgets import utils as budget_utils
from reports.views import import_freshness

from .expected import allowed_accounts, allowed_categories, blocked_category_ids, pot_tier
from .forecast import HORIZONS, NET_WORTH_YEARS, everyday_forecast, net_worth_forecast
from .models import ExpectedItem
from .serializers import ExpectedItemSerializer


class ExpectedItemViewSet(viewsets.ModelViewSet):
    """Expected items, each with where it stands this month - see
    openspec/specs/forecasting."""

    serializer_class = ExpectedItemSerializer

    def get_queryset(self):
        return ExpectedItem.objects.select_related("category", "account")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.method == "GET":
            context.update(blocked=blocked_category_ids(), tier=pot_tier())
        return context

    @action(detail=False, methods=["get"])
    def options(self, request):
        """What an item may be recognised by: categories without a budget,
        then accounts outside the pot."""
        return Response(
            {
                "categories": [
                    {"id": c.id, "name": c.name, "parent": c.parent_id, "parent_name": c.parent.name if c.parent else None}
                    for c in allowed_categories()
                ],
                "accounts": [{"id": a.id, "name": a.name, "tier": a.tier} for a in allowed_accounts()],
            }
        )


class ForecastView(APIView):
    """The Everyday forecast over 30 or 90 days - see
    openspec/specs/forecasting."""

    def get(self, request):
        try:
            horizon_days = int(request.query_params.get("horizon_days", 90))
        except ValueError:
            horizon_days = None
        if horizon_days not in HORIZONS:
            return Response({"detail": "horizon_days must be 30 or 90."}, status=400)
        forecast = everyday_forecast(budget_utils.today(), horizon_days)
        # The pot's accounts with when they were last imported, for the
        # stale-import line - see the forecasting spec.
        accounts = [
            a
            for a in Account.objects.visible().filter(archived=False).order_by(tier_position(), "name", "id")
            if a.tier == forecast["tier"]
        ]
        freshness = import_freshness(accounts)
        forecast["accounts"] = [
            {"id": a.id, "name": a.name, "account_type": a.account_type, "tier": a.tier, **freshness[a.id]}
            for a in accounts
        ]
        return Response(forecast)


class NetWorthForecastView(APIView):
    """Net worth month by month over 1, 3 or 5 years - see
    openspec/specs/forecasting."""

    def get(self, request):
        try:
            years = int(request.query_params.get("years", 1))
        except ValueError:
            years = None
        if years not in NET_WORTH_YEARS:
            return Response({"detail": "years must be 1, 3 or 5."}, status=400)
        forecast = net_worth_forecast(budget_utils.today(), 12 * years)
        # Every active account counts in net worth, so each can be stale.
        accounts = list(Account.objects.visible().filter(archived=False).order_by(tier_position(), "name", "id"))
        freshness = import_freshness(accounts)
        forecast["accounts"] = [
            {"id": a.id, "name": a.name, "account_type": a.account_type, "tier": a.tier, **freshness[a.id]}
            for a in accounts
        ]
        return Response(forecast)

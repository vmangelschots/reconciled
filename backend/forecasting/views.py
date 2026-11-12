from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from budgets import utils as budget_utils

from .expected import allowed_accounts, allowed_categories, blocked_category_ids, pot_tier
from .forecast import HORIZONS, everyday_forecast
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
        return Response(everyday_forecast(budget_utils.today(), horizon_days))

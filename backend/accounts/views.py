from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from transactions.adjustments import AdjustmentError, set_value
from transactions.serializers import TransactionSerializer

from .models import Account, tier_position
from .serializers import AccountSerializer


class SetValueSerializer(serializers.Serializer):
    date = serializers.DateField()
    value_cents = serializers.IntegerField()


class AccountViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """No destroy action: the accounts spec only defines archiving, not
    deleting, so DELETE is intentionally not exposed here."""

    serializer_class = AccountSerializer

    def get_queryset(self):
        # By tier, then name - see the accounts spec's "Accounts are
        # listed by tier".
        queryset = Account.objects.order_by(tier_position(), "name", "id")
        if self.action == "list":
            # Archived accounts are excluded from the default list but
            # remain reachable by id (retrieve/update/archive), so their
            # history stays viewable per the accounts spec.
            queryset = queryset.filter(archived=False)
        return queryset

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        account = self.get_object()
        account.archived = True
        account.save(update_fields=["archived"])
        return Response(self.get_serializer(account).data)

    @action(detail=True, methods=["post"], url_path="set-value")
    def set_value(self, request, pk=None):
        """POST {"date", "value_cents"} records the account's value on that
        date as a value adjustment; see openspec/specs/value-adjustments.
        Returns the adjustment and the account's new balance."""
        account = self.get_object()
        body = SetValueSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            adjustment = set_value(account, body.validated_data["date"], body.validated_data["value_cents"])
        except AdjustmentError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        account.refresh_from_db()
        return Response(
            {
                "adjustment": TransactionSerializer(adjustment).data,
                "current_balance_cents": account.current_balance_cents,
            },
            status=status.HTTP_201_CREATED,
        )

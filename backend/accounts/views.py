from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Account, tier_position
from .serializers import AccountSerializer


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

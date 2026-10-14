from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Account
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
        queryset = Account.objects.all()
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

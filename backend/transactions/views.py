from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Account

from .models import Transaction
from .serializers import TransactionSerializer
from .transfers import TransferError, delete_transaction, link_transfer, unlink_transfer


class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer

    def get_queryset(self):
        queryset = Transaction.objects.select_related(
            "account", "category", "transfer_counterpart__account"
        ).all()
        params = self.request.query_params

        account_id = params.get("account")
        if account_id:
            queryset = queryset.filter(account_id=account_id)

        date_from = params.get("date_from")
        if date_from:
            queryset = queryset.filter(date__gte=date_from)

        date_to = params.get("date_to")
        if date_to:
            queryset = queryset.filter(date__lte=date_to)

        category_id = params.get("category")
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        search = params.get("search")
        if search:
            queryset = queryset.filter(Q(payee__icontains=search) | Q(notes__icontains=search))

        return queryset

    def perform_destroy(self, instance):
        delete_transaction(instance)

    @action(detail=True, methods=["post", "delete"])
    def transfer(self, request, pk=None):
        """POST {"account": id} links this transaction as a transfer to/from
        that account (matching or creating the other side); DELETE unlinks.
        Both return this transaction and, after POST, its counterpart."""
        txn = self.get_object()
        if request.method == "DELETE":
            unlink_transfer(txn)
            return Response({"transaction": self._serialized(txn.pk)})

        try:
            target = Account.objects.get(pk=request.data.get("account"))
        except (Account.DoesNotExist, ValueError, TypeError):
            return Response({"account": ["Unknown account."]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            txn, counterpart = link_transfer(txn, target)
        except TransferError as e:
            return Response({"account": [str(e)]}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"transaction": self._serialized(txn.pk), "counterpart": self._serialized(counterpart.pk)}
        )

    def _serialized(self, pk):
        return self.get_serializer(self.get_queryset().get(pk=pk)).data

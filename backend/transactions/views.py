from django.db.models import Q
from rest_framework import viewsets

from .models import Transaction
from .serializers import TransactionSerializer


class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer

    def get_queryset(self):
        queryset = Transaction.objects.select_related("account", "category").all()
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

from django.db import transaction as db_transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Account
from budgets.models import Category

from .categorize import categorize, needs_review, review_groups, uncategorized
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

    @action(detail=False, methods=["get"], url_path="review-groups")
    def review_groups(self, request):
        """The Review page: unconfirmed guesses grouped by payee and guess,
        plus how many transactions the backfill could still try."""
        return Response({"groups": review_groups(), "uncategorized_count": uncategorized().count()})

    @action(detail=False, methods=["get"], url_path="review-count")
    def review_count(self, request):
        return Response({"count": needs_review().count()})

    @action(detail=False, methods=["post"], url_path="confirm-categories")
    def confirm_categories(self, request):
        """POST {"ids": [...]} confirms the guesses among those ids; with
        "category": id it sets that category on them and confirms it. Takes
        explicit ids so only the rows the user saw are touched."""
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            return Response({"ids": ["A list of transaction ids is required."]}, status=status.HTTP_400_BAD_REQUEST)
        # A transfer never has a category, so it's never confirmed this way.
        rows = Transaction.objects.filter(pk__in=ids, transfer_counterpart__isnull=True)

        if "category" not in request.data:
            confirmed = rows.filter(category__isnull=False, category_confirmed=False).update(
                category_confirmed=True, updated_at=timezone.now()
            )
            return Response({"confirmed_count": confirmed})

        try:
            category = Category.objects.get(pk=request.data["category"])
        except (Category.DoesNotExist, ValueError, TypeError):
            return Response({"category": ["Unknown category."]}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        with db_transaction.atomic():
            kept = rows.filter(category=category).update(category_confirmed=True, updated_at=now)
            changed = rows.exclude(category=category).update(
                category=category,
                category_confirmed=True,
                category_source=Transaction.CategorySource.MANUAL,
                updated_at=now,
            )
        return Response({"confirmed_count": kept + changed})

    @action(detail=False, methods=["post"])
    def categorize(self, request):
        """POST {} guesses categories for every uncategorized transaction
        from history; {"account": id} limits it to that account."""
        rows = uncategorized()
        account_id = request.data.get("account")
        if account_id is not None:
            try:
                account = Account.objects.get(pk=account_id)
            except (Account.DoesNotExist, ValueError, TypeError):
                return Response({"account": ["Unknown account."]}, status=status.HTTP_400_BAD_REQUEST)
            rows = rows.filter(account=account)
        rows = list(rows)
        return Response({"categorized_count": categorize(rows), "attempted_count": len(rows)})

    def _serialized(self, pk):
        return self.get_serializer(self.get_queryset().get(pk=pk)).data

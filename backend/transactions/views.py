from django.db import transaction as db_transaction
from django.db.models import Prefetch, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Account
from budgets.models import Category
from budgets.tabs import TAB_GROUP_ERROR

from . import tabs
from .ai import get_guesser
from .categorize import categorize, needs_review, review_groups, uncategorized
from .loans import sync_loans
from .models import Transaction
from .serializers import SplitLineSerializer, TransactionSerializer
from .splits import SplitError, delete_transaction, save_split, unsplit
from .transfers import TransferError, link_transfer, unlink_transfer


class TransactionViewSet(viewsets.ModelViewSet):
    serializer_class = TransactionSerializer

    def get_queryset(self):
        queryset = Transaction.objects.select_related(
            "account", "category", "transfer_counterpart__account", "loan", "loan_adjustment__account"
        ).prefetch_related(
            Prefetch(
                "parts",
                queryset=Transaction.objects.select_related("category", "transfer_counterpart__account"),
            )
        )
        if self.action == "list":
            # Parts are listed inside their split transaction, never as
            # rows of their own; detail routes still reach them.
            queryset = queryset.ledger_rows()
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
            # A split transaction matches through any of its parts.
            queryset = queryset.filter(Q(category_id=category_id) | Q(parts__category_id=category_id)).distinct()

        search = params.get("search")
        if search:
            queryset = queryset.filter(
                Q(payee__icontains=search) | Q(notes__icontains=search) | Q(parts__notes__icontains=search)
            ).distinct()

        return queryset

    def list(self, request, *args, **kwargs):
        # Any ledger may show a loan installment or its payment; see the
        # loan-schedules spec's "Matching needs no background job".
        sync_loans(timezone.localdate())
        return super().list(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        txn = self.get_object()
        if txn.loan_id is not None:
            return Response(
                {"detail": "This adjustment belongs to the loan schedule. Change the loan's terms instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            delete_transaction(txn)
        except SplitError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["put", "delete"])
    def split(self, request, pk=None):
        """PUT {"parts": [{id?, amount_cents, category?, transfer_account?,
        notes?}]} splits this transaction or changes its split; DELETE
        unsplits it, keeping an optional {"category": id} or
        {"transfer_account": id}. Both return this transaction with its
        parts. A 400 is {"detail", "line"}: line is the index of the part
        it concerns, or null."""
        txn = self.get_object()
        if txn.is_adjustment:
            return self._split_error("A value adjustment can't be split.")
        if request.method == "DELETE":
            return self._unsplit(txn, request.data or {})

        lines = request.data.get("parts")
        if not isinstance(lines, list):
            return self._split_error("A list of parts is required.")
        parsed = []
        for index, line in enumerate(lines):
            serializer = SplitLineSerializer(data=line)
            if not serializer.is_valid():
                field, messages = next(iter(serializer.errors.items()))
                return self._split_error(f"{field}: {messages[0]}", index)
            parsed.append(serializer.to_line())
        try:
            txn = save_split(txn, parsed)
        except SplitError as e:
            return self._split_error(str(e), e.line)
        return Response(self._serialized(txn.pk))

    def _unsplit(self, txn, data):
        keep = SplitLineSerializer(data={"amount_cents": 0, **data})
        if not keep.is_valid():
            field, messages = next(iter(keep.errors.items()))
            return self._split_error(f"{field}: {messages[0]}")
        try:
            txn = unsplit(
                txn,
                category=keep.validated_data.get("category"),
                transfer_account=keep.validated_data.get("transfer_account"),
            )
        except (SplitError, TransferError) as e:
            return self._split_error(str(e))
        return Response(self._serialized(txn.pk))

    def _split_error(self, message, line=None):
        return Response({"detail": message, "line": line}, status=status.HTTP_400_BAD_REQUEST)

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
        how many transactions the backfill could still try, and whether it
        would use AI."""
        return Response(
            {
                "groups": review_groups(),
                "uncategorized_count": uncategorized().count(),
                "ai_enabled": get_guesser() is not None,
            }
        )

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
        # A transfer never has a category, so it's never confirmed this way,
        # and neither is a value adjustment.
        rows = Transaction.objects.excluding_adjustments().filter(pk__in=ids, transfer_counterpart__isnull=True)

        if "category" not in request.data:
            confirmed = rows.filter(category__isnull=False, category_confirmed=False).update(
                category_confirmed=True, updated_at=timezone.now()
            )
            return Response({"confirmed_count": confirmed})

        try:
            category = Category.objects.get(pk=request.data["category"])
        except (Category.DoesNotExist, ValueError, TypeError):
            return Response({"category": ["Unknown category."]}, status=status.HTTP_400_BAD_REQUEST)
        if category.is_tab_group:
            return Response({"category": [TAB_GROUP_ERROR]}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        with db_transaction.atomic():
            kept = rows.filter(category=category).update(category_confirmed=True, updated_at=now)
            changed = rows.exclude(category=category).update(
                category=category,
                category_confirmed=True,
                category_source=Transaction.CategorySource.MANUAL,
                category_reason="",
                updated_at=now,
            )
        return Response({"confirmed_count": kept + changed})

    @action(detail=False, methods=["post"])
    def categorize(self, request):
        """POST {} guesses categories for every uncategorized transaction,
        from history and then AI when it's configured; {"account": id}
        limits it to that account."""
        rows = uncategorized()
        account_id = request.data.get("account")
        if account_id is not None:
            try:
                account = Account.objects.get(pk=account_id)
            except (Account.DoesNotExist, ValueError, TypeError):
                return Response({"account": ["Unknown account."]}, status=status.HTTP_400_BAD_REQUEST)
            rows = rows.filter(account=account)
        rows = list(rows)
        return Response({**categorize(rows).summary(), "attempted_count": len(rows)})

    def _serialized(self, pk):
        return self.get_serializer(self.get_queryset().get(pk=pk)).data


def _tab_body(summary, with_rows=False):
    category = summary.category
    body = {
        "id": category.id,
        "name": category.name,
        "group_name": category.parent.name,
        "balance_cents": summary.balance_cents,
        "open_since": summary.open_since,
        "row_count": len(summary.rows),
    }
    if with_rows:
        body["rows"] = [
            {
                "id": row.id,
                "date": row.date,
                "payee": row.payee,
                "notes": row.notes,
                "amount_cents": row.amount_cents,
                "running_balance_cents": running,
                "split_parent": row.split_parent_id,
                "parent_amount_cents": row.split_parent.amount_cents if row.split_parent_id else None,
            }
            for row, running in summary.rows
        ]
    return body


class TabViewSet(viewsets.ViewSet):
    """What each tab's person owes; see transactions/tabs.py."""

    def list(self, request):
        return Response([_tab_body(s) for s in tabs.balances()])

    def retrieve(self, request, pk=None):
        category = tabs.tabs().filter(pk=pk).first() if str(pk).isdigit() else None
        if category is None:
            return Response({"detail": "Tab not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_tab_body(tabs.tab_detail(category), with_rows=True))

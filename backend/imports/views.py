from django.db import transaction as db_transaction
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import Account
from transactions.models import Transaction

from .models import ImportSession
from .serializers import ImportSessionSerializer
from .utils import (
    ImportParseError,
    csv_columns,
    decode_upload,
    detect_delimiter,
    detect_file_format,
    flag_duplicates,
    flag_transfer_matches,
    parse_csv_candidates,
    parse_ofx_candidates,
)


class ImportSessionViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Upload (create) -> for CSV, map() -> preview (candidates, already
    on the session after create/map) -> commit(). Nothing is written to
    the transactions ledger until commit() is called.
    """

    queryset = ImportSession.objects.all()
    serializer_class = ImportSessionSerializer
    # create (upload) needs multipart for the file; map/commit send JSON.
    parser_classes = [MultiPartParser, JSONParser]

    def create(self, request, *args, **kwargs):
        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"file": "A file is required."}, status=400)
        try:
            account = Account.objects.get(pk=request.data.get("account"))
        except (Account.DoesNotExist, TypeError, ValueError):
            return Response({"account": "A valid account is required."}, status=400)

        try:
            file_format = detect_file_format(file_obj.name)
            raw_content = decode_upload(file_obj)
        except ImportParseError as exc:
            return Response({"detail": str(exc)}, status=400)

        session = ImportSession.objects.create(
            account=account, file_format=file_format, raw_content=raw_content
        )

        if file_format == ImportSession.FileFormat.OFX:
            try:
                candidates = parse_ofx_candidates(raw_content)
            except ImportParseError as exc:
                session.delete()
                return Response({"detail": str(exc)}, status=400)
            self._store_candidates(session, candidates)
            return Response(self._representation(session), status=201)

        # CSV: detect the delimiter once now and store it, so the map()
        # action below reuses the same one instead of re-sniffing (and
        # potentially re-detecting differently) from raw_content later.
        # No candidates yet - return the header columns so the user can
        # map them.
        delimiter = detect_delimiter(raw_content)
        try:
            columns = csv_columns(raw_content, delimiter=delimiter)
        except ImportParseError as exc:
            session.delete()
            return Response({"detail": str(exc)}, status=400)
        session.delimiter = delimiter
        session.save(update_fields=["delimiter"])
        data = self._representation(session)
        data["columns"] = columns
        return Response(data, status=201)

    @action(detail=True, methods=["post"])
    def map(self, request, pk=None):
        session = self.get_object()
        if session.file_format != ImportSession.FileFormat.CSV:
            return Response({"detail": "Only CSV imports take a column mapping."}, status=400)
        if session.status == ImportSession.Status.COMMITTED:
            return Response({"detail": "This import has already been committed."}, status=400)

        mapping = {
            key: request.data.get(key)
            for key in ("date", "date_format", "description", "amount", "debit", "credit", "payee")
        }
        try:
            candidates = parse_csv_candidates(session.raw_content, mapping, delimiter=session.delimiter)
        except ImportParseError as exc:
            return Response({"detail": str(exc)}, status=400)

        self._store_candidates(session, candidates)
        return Response(self._representation(session))

    @action(detail=True, methods=["post"])
    def commit(self, request, pk=None):
        session = self.get_object()
        if session.status == ImportSession.Status.COMMITTED:
            return Response({"detail": "This import has already been committed."}, status=400)
        if not session.candidates:
            return Response({"detail": "Nothing to commit - no candidates parsed yet."}, status=400)

        selected_indices = set(request.data.get("selected_indices", []))
        to_create = [c for c in session.candidates if c["index"] in selected_indices]

        with db_transaction.atomic():
            new_rows = []
            confirmed = 0
            for c in to_create:
                notes = c["description"] if c["description"] != c["payee"] else ""
                if self._confirm_transfer_counterpart(session.account, c, notes):
                    confirmed += 1
                    continue
                new_rows.append(
                    Transaction(
                        account=session.account,
                        date=c["date"],
                        amount_cents=c["amount_cents"],
                        payee=c["payee"],
                        notes=notes,
                    )
                )
            created = Transaction.objects.bulk_create(new_rows)
            session.status = ImportSession.Status.COMMITTED
            session.save(update_fields=["status"])

        return Response({"created_count": len(created), "confirmed_transfer_count": confirmed}, status=201)

    def _confirm_transfer_counterpart(self, account, candidate, notes):
        """If the candidate matched a created transfer counterpart, overwrite
        that counterpart with the bank's line (keeping the link) and return
        True. If the counterpart is gone or no longer unconfirmed since the
        preview, return False so the line is created normally."""
        match = candidate.get("transfer_match")
        if not match:
            return False
        txn = (
            Transaction.objects.select_for_update()
            .filter(
                pk=match["transaction_id"],
                account=account,
                created_by_transfer=True,
                transfer_counterpart__isnull=False,
            )
            .first()
        )
        if txn is None:
            return False
        txn.date = candidate["date"]
        txn.payee = candidate["payee"]
        txn.notes = notes
        txn.created_by_transfer = False
        txn.save(update_fields=["date", "payee", "notes", "created_by_transfer", "updated_at"])
        return True

    def _store_candidates(self, session, candidates):
        # A real bank export can't produce a zero-amount transaction (the
        # transactions spec requires non-zero amounts); drop any before
        # they ever become commit-able candidates.
        candidates = [c for c in candidates if c["amount_cents"] != 0]
        session.candidates = flag_transfer_matches(
            session.account, flag_duplicates(session.account, candidates)
        )
        session.save(update_fields=["candidates"])

    def _representation(self, session):
        return ImportSessionSerializer(session).data

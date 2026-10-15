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
    detect_file_format,
    flag_duplicates,
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

        # CSV: no candidates yet - return the header columns so the user
        # can map them via the map() action below.
        try:
            columns = csv_columns(raw_content)
        except ImportParseError as exc:
            session.delete()
            return Response({"detail": str(exc)}, status=400)
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
            for key in ("date", "description", "amount", "debit", "credit", "payee")
        }
        try:
            candidates = parse_csv_candidates(session.raw_content, mapping)
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
            created = Transaction.objects.bulk_create(
                Transaction(
                    account=session.account,
                    date=c["date"],
                    amount_cents=c["amount_cents"],
                    payee=c["payee"],
                    notes=c["description"] if c["description"] != c["payee"] else "",
                )
                for c in to_create
            )
            session.status = ImportSession.Status.COMMITTED
            session.save(update_fields=["status"])

        return Response({"created_count": len(created)}, status=201)

    def _store_candidates(self, session, candidates):
        # A real bank export can't produce a zero-amount transaction (the
        # transactions spec requires non-zero amounts); drop any before
        # they ever become commit-able candidates.
        candidates = [c for c in candidates if c["amount_cents"] != 0]
        session.candidates = flag_duplicates(session.account, candidates)
        session.save(update_fields=["candidates"])

    def _representation(self, session):
        return ImportSessionSerializer(session).data

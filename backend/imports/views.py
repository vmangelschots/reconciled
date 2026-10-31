import csv
import io

from django.db import transaction as db_transaction
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import Account
from transactions.ai import get_guesser
from transactions.models import Transaction
from transactions.transfers import link_pair

from .ledger import (
    confirm_transfer_counterpart,
    new_transaction,
    settle_accounts,
    settle_new_transactions,
)
from .models import AccountImportSettings, ImportSession
from .presets import PRESETS_BY_KEY, detect_preset, pair_pocket_moves, products_in
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

# The mapping fields that name a column (date_format doesn't).
MAPPING_COLUMN_FIELDS = ("date", "description", "amount", "debit", "credit", "payee")

# Revolut's own account; its rows go to the account chosen for the upload.
REVOLUT_MAIN_PRODUCT = "Current"


def _on_account(candidates, account):
    return [{**c, "account_id": account.pk, "account_name": account.name} for c in candidates]


class ImportSessionViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Upload (create) -> for CSV, map() (or assign() for a Revolut file
    with several Products) -> preview (candidates, already on the session
    after create/map/assign) -> commit(). Nothing is written to the
    transactions ledger until commit() is called.
    """

    queryset = ImportSession.objects.all()
    serializer_class = ImportSessionSerializer
    # create (upload) needs multipart for the file; map/assign/commit send JSON.
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
            self._store_candidates(session, _on_account(candidates, account))
            return Response(self._representation(session), status=201)

        # CSV: detect the delimiter once now and store it, so the map()
        # action below reuses the same one instead of re-sniffing (and
        # potentially re-detecting differently) from raw_content later.
        delimiter = detect_delimiter(raw_content)
        try:
            columns = csv_columns(raw_content, delimiter=delimiter)
        except ImportParseError as exc:
            session.delete()
            return Response({"detail": str(exc)}, status=400)
        session.delimiter = delimiter
        preset = detect_preset(columns)
        if preset is not None:
            session.preset = preset.key
        session.save(update_fields=["delimiter", "preset"])

        if preset is not None:
            try:
                candidates = self._parse_preset(session)
            except ImportParseError as exc:
                session.delete()
                return Response({"detail": str(exc)}, status=400)
            products = products_in(candidates) if preset.key == "revolut" else []
            if len(products) > 1:
                # Several Products: ask where each goes before the preview.
                data = self._representation(session)
                data["products"] = products
                data["product_accounts"] = self._preselected_products(account, products)
                return Response(data, status=201)
            self._store_candidates(session, _on_account(candidates, account))
            return Response(self._representation(session), status=201)

        # No candidates yet - return the header columns so the user can
        # map them, with this account's last mapping when it still fits.
        data = self._representation(session)
        data["columns"] = columns
        data["saved_mapping"] = self._saved_mapping(account, columns)
        return Response(data, status=201)

    @action(detail=True, methods=["post"])
    def map(self, request, pk=None):
        session = self.get_object()
        if session.file_format != ImportSession.FileFormat.CSV or session.preset:
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

        session.mapping = mapping
        session.save(update_fields=["mapping"])
        self._store_candidates(session, _on_account(candidates, session.account))
        return Response(self._representation(session))

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        """Revolut with several Products: {"product_accounts": {product:
        account_id | null}} sends each Product's rows to an active account,
        or skips them (null). Every Product must have a choice."""
        session = self.get_object()
        if session.preset != "revolut":
            return Response({"detail": "Only Revolut imports send Products to accounts."}, status=400)
        if session.status == ImportSession.Status.COMMITTED:
            return Response({"detail": "This import has already been committed."}, status=400)

        candidates = self._parse_preset(session)
        choices = request.data.get("product_accounts") or {}
        missing = [p for p in products_in(candidates) if p not in choices]
        if missing:
            return Response({"detail": "Choose an account or skip: " + ", ".join(missing)}, status=400)
        chosen_ids = {v for v in choices.values() if v is not None}
        accounts = Account.objects.in_bulk(chosen_ids)
        if any(i not in accounts or accounts[i].archived for i in chosen_ids):
            return Response({"detail": "Products can only go to active accounts."}, status=400)

        routed = [
            {**c, "account_id": accounts[choices[c["product"]]].pk, "account_name": accounts[choices[c["product"]]].name}
            for c in candidates
            if choices[c["product"]] is not None
        ]
        session.product_accounts = {p: choices[p] for p in products_in(candidates)}
        session.save(update_fields=["product_accounts"])
        self._store_candidates(session, routed)
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
        account_ids = {c["account_id"] for c in session.candidates}
        accounts = Account.objects.in_bulk(account_ids)

        with db_transaction.atomic():
            new_rows = {}
            confirmed = 0
            for c in to_create:
                account = accounts[c["account_id"]]
                notes = c["description"] if c["description"] != c["payee"] else ""
                if confirm_transfer_counterpart(account, c, notes):
                    confirmed += 1
                    continue
                new_rows[c["index"]] = new_transaction(account, c)
            created = Transaction.objects.bulk_create(new_rows.values())

            # A pocket move whose two sides were both created becomes a
            # transfer; with only one side ticked it stays a normal line.
            pocket_moves = set()
            for c in to_create:
                pair = c.get("pocket_pair")
                if pair and c["index"] < pair["index"] and c["index"] in new_rows and pair["index"] in new_rows:
                    link_pair(new_rows[c["index"]], new_rows[pair["index"]])
                    pocket_moves.update((c["index"], pair["index"]))

            settle_accounts({row.account_id for row in created})

            session.status = ImportSession.Status.COMMITTED
            session.save(update_fields=["status"])
            session.imported_accounts.set(account_ids)
            self._remember_choices(session)

        # Only freshly created rows are guessed: a line that confirmed a
        # transfer counterpart or became a pocket move stays a transfer.
        categorized = settle_new_transactions(
            [t for index, t in new_rows.items() if index not in pocket_moves]
        )
        return Response(
            {
                "created_count": len(created),
                "confirmed_transfer_count": confirmed,
                **categorized.summary(),
            },
            status=201,
        )

    def _parse_preset(self, session):
        reader = csv.DictReader(io.StringIO(session.raw_content), delimiter=session.delimiter)
        return PRESETS_BY_KEY[session.preset].parse(list(reader))

    def _store_candidates(self, session, candidates):
        # A real bank export can't produce a zero-amount transaction (the
        # transactions spec requires non-zero amounts); drop any before
        # they ever become commit-able candidates.
        candidates = [
            {**c, "index": index}
            for index, c in enumerate(c for c in candidates if c["amount_cents"] != 0)
        ]
        if session.preset == "revolut":
            candidates = pair_pocket_moves(candidates)
        # Duplicates and created transfer counterparts are looked for in
        # each candidate's own account.
        accounts = Account.objects.in_bulk({c["account_id"] for c in candidates})
        flagged = []
        for account_id, account in accounts.items():
            group = [c for c in candidates if c["account_id"] == account_id]
            flagged += flag_transfer_matches(account, flag_duplicates(account, group))
        session.candidates = sorted(flagged, key=lambda c: c["index"])
        session.save(update_fields=["candidates"])

    def _settings(self, account):
        return AccountImportSettings.objects.filter(account=account).first()

    def _saved_mapping(self, account, columns):
        """The account's last CSV mapping, when every column it names is in
        this file; otherwise None and the mapping step starts empty."""
        settings = self._settings(account)
        mapping = settings.csv_mapping if settings else None
        if not mapping:
            return None
        named = [mapping.get(field) for field in MAPPING_COLUMN_FIELDS if mapping.get(field)]
        return mapping if all(col in columns for col in named) else None

    def _preselected_products(self, account, products):
        """Current goes to the upload's account; any other Product to where
        it went last time from this account (null for skipped), unless that
        account is archived or gone. A Product with no usable earlier choice
        is left out, so the user has to choose."""
        settings = self._settings(account)
        remembered = settings.product_accounts if settings else {}
        active = set(Account.objects.filter(archived=False).values_list("pk", flat=True))
        choices = {}
        for product in products:
            if product == REVOLUT_MAIN_PRODUCT:
                choices[product] = account.pk
            elif product in remembered and (remembered[product] is None or remembered[product] in active):
                choices[product] = remembered[product]
        return choices

    def _remember_choices(self, session):
        if not session.mapping and not session.product_accounts:
            return
        settings, _ = AccountImportSettings.objects.get_or_create(account=session.account)
        if session.mapping:
            settings.csv_mapping = session.mapping
        if session.product_accounts:
            settings.product_accounts = {**settings.product_accounts, **session.product_accounts}
        settings.save()

    def _representation(self, session):
        # ai_enabled lets the commit button say the AI step can take a while.
        data = {**ImportSessionSerializer(session).data, "ai_enabled": get_guesser() is not None}
        data["preset_label"] = PRESETS_BY_KEY[session.preset].label if session.preset else None
        return data

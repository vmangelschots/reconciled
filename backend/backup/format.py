"""The backup file: what goes in it and how it goes back. See
openspec/specs/data-backup.

A backup is Django's "python" serialization of BACKED_UP_MODELS inside an
envelope (see build_backup). Restoring replaces every backed-up table with
the file's rows, keeping their ids and timestamps.

Versions: FORMAT_VERSION is the envelope's own shape, and "migrations"
records the latest migration of each backed-up app. A backup naming a
migration this install doesn't have comes from a newer app and is refused.
An older one loads into the current models: fields added since take their
default and fields removed since are ignored. A migration that reshapes
existing data (more than adding a field with a default) must bump
FORMAT_VERSION and add a converter here from the previous version.
"""

import json
from datetime import date, datetime, time
from decimal import Decimal

from django.apps import apps
from django.core import serializers
from django.core.management.color import no_style
from django.core.serializers.base import DeserializationError
from django.db import DatabaseError, connection, transaction
from django.db.migrations.loader import MigrationLoader
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone

FORMAT_VERSION = 1
APP_MARKER = "reconciled"

# Every model in the data apps is either backed up or excluded on purpose;
# backup/tests.py fails for one that is in neither list.
BACKED_UP_MODELS = [
    "accounts.Account",
    "accounts.Loan",
    "accounts.LoanCorrection",
    "budgets.Category",
    "budgets.CategoryLimit",
    "budgets.YearlyBudget",
    "budgets.BudgetSettings",
    "transactions.Transaction",
    "forecasting.RecurringTransaction",
    "imports.ImportSession",
    "imports.AccountImportSettings",
]
EXCLUDED_MODELS = []
DATA_APPS = ["accounts", "budgets", "transactions", "forecasting", "imports"]

NOT_A_BACKUP = "This file isn't a Reconciled backup."
UNREADABLE = "This backup can't be read. It may be damaged or cut off."
NEWER = "This backup was made by a newer version of Reconciled. Update the app, then restore it."
NOT_SAVED = "This backup couldn't be restored: some of its data doesn't fit together. Nothing was changed."


class BackupError(ValueError):
    """The file can't be restored; the message says why for the user."""


def backed_up_models():
    return [apps.get_model(label) for label in BACKED_UP_MODELS]


def _rows(model):
    ImportSession = apps.get_model("imports.ImportSession")
    queryset = model.objects.order_by("pk")
    if model is not ImportSession:
        return serializers.serialize("python", queryset)
    # Only committed imports, and only when they happened and where they
    # went (the last-import dates) - never the bank file or its lines.
    rows = serializers.serialize("python", queryset.filter(status=ImportSession.Status.COMMITTED))
    for row in rows:
        row["fields"].update(raw_content="", candidates=[])
    return rows


def _latest_migrations():
    applied = MigrationRecorder(connection).applied_migrations()
    latest = {}
    for app_label, name in applied:
        if app_label in DATA_APPS and name > latest.get(app_label, ""):
            latest[app_label] = name
    return latest


def build_backup():
    Account = apps.get_model("accounts.Account")
    Transaction = apps.get_model("transactions.Transaction")
    data = []
    for model in backed_up_models():
        data += _rows(model)
    return {
        "app": APP_MARKER,
        "format_version": FORMAT_VERSION,
        "exported_at": timezone.now().isoformat(),
        "migrations": _latest_migrations(),
        "summary": {
            "accounts": Account.objects.count(),
            # The bank's lines, as the user counts them: split parts are
            # inside their transaction.
            "transactions": Transaction.objects.ledger_rows().count(),
        },
        "data": data,
    }


def _encode(value):
    # Full precision, unlike DjangoJSONEncoder, which cuts times to
    # milliseconds - a restore keeps timestamps exactly.
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"Can't put {type(value).__name__} in a backup")


def dump_backup(backup):
    return json.dumps(backup, default=_encode)


def backup_filename():
    return f"reconciled-backup-{timezone.localdate().isoformat()}.json"


def read_backup(content):
    """Check a backup file's content (bytes or str) and deserialize it,
    without writing anything. Returns the objects to restore; raises
    BackupError."""
    if isinstance(content, bytes):
        try:
            content = content.decode("utf-8")
        except UnicodeDecodeError:
            raise BackupError(NOT_A_BACKUP) from None
    if not content.lstrip().startswith("{"):
        raise BackupError(NOT_A_BACKUP)
    try:
        envelope = json.loads(content)
    except ValueError:
        raise BackupError(UNREADABLE) from None
    if envelope.get("app") != APP_MARKER:
        raise BackupError(NOT_A_BACKUP)
    if envelope.get("format_version") != FORMAT_VERSION:
        raise BackupError(NEWER)

    migrations = envelope.get("migrations")
    data = envelope.get("data")
    if not isinstance(migrations, dict) or not isinstance(data, list):
        raise BackupError(UNREADABLE)
    known = MigrationLoader(None, ignore_no_migrations=True).disk_migrations
    if any((app_label, name) not in known for app_label, name in migrations.items()):
        raise BackupError(NEWER)

    labels = {model._meta.label_lower for model in backed_up_models()}
    if any(not isinstance(row, dict) or row.get("model") not in labels for row in data):
        raise BackupError(UNREADABLE)
    try:
        return list(serializers.deserialize("python", data, ignorenonexistent=True))
    except (DeserializationError, ValueError, TypeError, LookupError):
        raise BackupError(UNREADABLE) from None


def restore_backup(objects):
    """Replace every backed-up table with `objects` (from read_backup), all
    or nothing. Returns the restored counts; raises BackupError."""
    models = backed_up_models()
    ImportSession = apps.get_model("imports.ImportSession")
    imported_accounts = ImportSession.imported_accounts.through
    tables = ", ".join(connection.ops.quote_name(m._meta.db_table) for m in [*models, imported_accounts])
    try:
        with transaction.atomic(), connection.cursor() as cursor:
            # Foreign keys are checked at commit (deferred). Run any pending
            # checks first - TRUNCATE refuses a table with some - and check
            # the restored rows before leaving, so a dangling link fails
            # here and rolls back rather than at some later commit.
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute(f"TRUNCATE {tables} RESTART IDENTITY CASCADE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            for obj in objects:
                obj.save()
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute("SET CONSTRAINTS ALL DEFERRED")
            # Rows keep their ids, so new rows must be numbered after them.
            for sql in connection.ops.sequence_reset_sql(no_style(), [*models, imported_accounts]):
                cursor.execute(sql)
    except DatabaseError:
        raise BackupError(NOT_SAVED) from None

    Account = apps.get_model("accounts.Account")
    Transaction = apps.get_model("transactions.Transaction")
    return {
        "accounts": sum(isinstance(o.object, Account) for o in objects),
        "transactions": sum(
            isinstance(o.object, Transaction) and o.object.split_parent_id is None for o in objects
        ),
    }

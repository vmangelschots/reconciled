"""The backup file: what goes in it and how it goes back. See
openspec/specs/data-backup.

A backup is Django's "python" serialization of one household's rows of
BACKED_UP_MODELS inside an envelope (see build_backup), with no household in
them. Restoring replaces the current household's rows with the file's, keeping
timestamps. Rows get new ids: tables are shared, so the file's ids may belong to
another household by now. Every link is rewritten to match, and a link to
anything outside the file refuses the restore, so a file can't reach another
household.

Versions: FORMAT_VERSION is the envelope's own shape, and "migrations"
records the latest migration of each backed-up app. A backup naming a
migration this install doesn't have comes from a newer app and is refused.
An older one loads into the current models: fields added since take their
default and fields removed since are ignored. A migration that reshapes
existing data (more than adding a field with a default) must bump
FORMAT_VERSION and add a converter here from the previous version. Version 1 is
from before households; its rows already are one household's. Version 3
replaced recurring transactions with expected items (_expected_from_recurring).
"""

import json
from datetime import date, datetime, time
from decimal import Decimal

from django.apps import apps
from django.core import serializers
from django.core.serializers.base import DeserializationError
from django.db import DatabaseError, connection, transaction
from django.db.migrations.loader import MigrationLoader
from django.db.migrations.recorder import MigrationRecorder
from django.utils import timezone

from banksync.sync import household_lock
from households.context import current_household

FORMAT_VERSION = 3
READABLE_VERSIONS = {1, 2, 3}
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
    "budgets.Bill",
    "budgets.BudgetSettings",
    "transactions.Transaction",
    "forecasting.ExpectedItem",
    "imports.ImportSession",
    "imports.AccountImportSettings",
    "banksync.BankAccountLink",
    "banksync.SeenBankLine",
]
# Bank access: a restore clears connections, and links wait to be reconnected.
# Credentials stay with the household.
EXCLUDED_MODELS = ["banksync.BankConnection", "banksync.BankCredentials"]
DATA_APPS = ["accounts", "budgets", "transactions", "forecasting", "imports", "banksync"]

NOT_A_BACKUP = "This file isn't a Reconciled backup."
UNREADABLE = "This backup can't be read. It may be damaged or cut off."
NEWER = "This backup was made by a newer version of Reconciled. Update the app, then restore it."
NOT_SAVED = "This backup couldn't be restored: some of its data doesn't fit together. Nothing was changed."
SYNC_RUNNING = "A bank sync is running. Try again in a moment. Nothing was changed."


class BackupError(ValueError):
    """The file can't be restored; the message says why for the user."""


def backed_up_models():
    return [apps.get_model(label) for label in BACKED_UP_MODELS]


def _rows(model):
    ImportSession = apps.get_model("imports.ImportSession")
    BankAccountLink = apps.get_model("banksync.BankAccountLink")
    queryset = model.objects.order_by("pk")
    if model is ImportSession:
        # Only committed imports, and only when they happened and where they
        # went (the last-import dates) - never the bank file or its lines.
        queryset = queryset.filter(status=ImportSession.Status.COMMITTED)
    rows = serializers.serialize("python", queryset)
    for row in rows:
        row["fields"].pop("household", None)
        if model is BankAccountLink:
            row["fields"].update(connection=None, account_uid="")
        if model is ImportSession:
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
        "household": current_household().name,
        "migrations": _latest_migrations(),
        "summary": {
            "accounts": Account.objects.visible().count(),
            # The bank's lines, as the user counts them: split parts are
            # inside their transaction, and covered entries aren't any
            # bank's.
            "transactions": Transaction.objects.ledger_rows().filter(account__is_off_bank=False).count(),
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
    """Check a backup file's content (bytes or str) without writing anything.
    Returns its rows; raises BackupError."""
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
    if envelope.get("format_version") not in READABLE_VERSIONS:
        raise BackupError(NEWER)

    migrations = envelope.get("migrations")
    data = envelope.get("data")
    if not isinstance(migrations, dict) or not isinstance(data, list):
        raise BackupError(UNREADABLE)
    known = MigrationLoader(None, ignore_no_migrations=True).disk_migrations
    if any((app_label, name) not in known for app_label, name in migrations.items()):
        raise BackupError(NEWER)

    if envelope["format_version"] < 3:
        data = _expected_from_recurring(data)
    labels = {model._meta.label_lower for model in backed_up_models()}
    if any(not isinstance(row, dict) or row.get("model") not in labels for row in data):
        raise BackupError(UNREADABLE)
    try:
        list(serializers.deserialize("python", data, ignorenonexistent=True))
    except (DeserializationError, ValueError, TypeError, LookupError):
        raise BackupError(UNREADABLE) from None
    return data


RECURRING = "forecasting.recurringtransaction"
BUDGET_KINDS = {"yearly", "target", "bills"}


def _expected_from_recurring(data):
    """Version 2 -> 3: monthly recurring transactions that haven't ended and
    have a category an expected item may use become expected items; the
    others are dropped. The same rule as the migration
    forecasting/0003_recurring_to_expected, read from the file's own rows."""
    if not all(isinstance(row, dict) and isinstance(row.get("fields"), dict) for row in data):
        raise BackupError(UNREADABLE)
    fields_of = lambda model: [row["fields"] | {"pk": row.get("pk")} for row in data if row.get("model") == model]  # noqa: E731
    limited = {f.get("category") for f in fields_of("budgets.categorylimit")}
    loans = {f.get("payment_category") for f in fields_of("accounts.loan")} - {None}
    categories = fields_of("budgets.category")
    covering = {
        c["pk"] for c in categories
        if c.get("budget_kind") in BUDGET_KINDS or c["pk"] in limited or c["pk"] in loans or c.get("is_tab_group")
    }
    blocked = covering | {c["pk"] for c in categories if c.get("parent") in covering}
    today = timezone.localdate().isoformat()

    converted = []
    for row in data:
        if row.get("model") != RECURRING:
            converted.append(row)
            continue
        f = row["fields"]
        try:
            amount = int(f.get("amount_cents") or 0)
            day = int(str(f.get("start_date"))[8:10])
        except ValueError:
            raise BackupError(UNREADABLE) from None
        usable = (
            f.get("frequency") == "monthly"
            and (not f.get("end_date") or str(f["end_date"]) >= today)
            and amount != 0
            and f.get("category") is not None
            and f["category"] not in blocked
        )
        if usable:
            converted.append(
                {
                    "model": "forecasting.expecteditem",
                    "pk": row.get("pk"),
                    "fields": {
                        "name": f.get("payee") or "",
                        "direction": "in" if amount > 0 else "out",
                        "amount_cents": abs(amount),
                        "day": day,
                        "category": f["category"],
                        "account": None,
                        "created_at": f.get("created_at"),
                        "updated_at": f.get("updated_at"),
                    },
                }
            )
    return converted


def clear_household(household, *, keep_credentials=True):
    """Delete the bound household's rows, leaving its login and invites. Raw
    deletes, children first: signals would recompute what's being deleted, and
    PROTECT would refuse half of it. Foreign keys wait for the commit."""
    get = apps.get_model
    ImportSession = get("imports.ImportSession")
    imported_accounts = ImportSession.imported_accounts.through
    imported_accounts.objects.filter(importsession__account__household=household).order_by()._raw_delete(
        using=connection.alias
    )
    models = [
        get("banksync.SeenBankLine"),
        get("banksync.BankAccountLink"),
        get("banksync.BankConnection"),
        get("transactions.Transaction"),
        get("accounts.LoanCorrection"),
        get("accounts.Loan"),
        ImportSession,
        get("imports.AccountImportSettings"),
        get("forecasting.ExpectedItem"),
        get("budgets.CategoryLimit"),
        get("budgets.YearlyBudget"),
        get("budgets.Bill"),
        get("budgets.BudgetSettings"),
        get("budgets.Category"),
        get("accounts.Account"),
    ]
    if not keep_credentials:
        models.insert(0, get("banksync.BankCredentials"))
    for model in models:
        model.objects.order_by()._raw_delete(using=connection.alias)


def _new_ids(rows):
    """{model label: {id in the file: new id}}, taken from each table's own
    sequence, so anything added later is numbered after them."""
    ids = {}
    with connection.cursor() as cursor:
        for model in backed_up_models():
            label = model._meta.label_lower
            old = [row.get("pk") for row in rows if row["model"] == label]
            if len(set(old)) != len(old):
                raise BackupError(NOT_SAVED)
            cursor.execute(
                "SELECT nextval(pg_get_serial_sequence(%s, 'id')) FROM generate_series(1, %s)",
                [model._meta.db_table, len(old)],
            )
            ids[label] = dict(zip(old, [new for (new,) in cursor.fetchall()]))
    return ids


def _new_id(ids, target, value):
    try:
        return ids[target][value]
    except (KeyError, TypeError):
        # Pointing outside the file: not this backup's to touch.
        raise BackupError(NOT_SAVED) from None


def _rewritten(row, ids, household):
    """A copy of a file row, with its new id, links and household."""
    model = apps.get_model(row["model"])
    fields = dict(row["fields"])
    for field in model._meta.concrete_fields:
        if field.name == "household" or not field.remote_field or fields.get(field.name) is None:
            continue
        target = field.remote_field.model._meta.label_lower
        # Connections aren't in a backup; a link waits to be reconnected.
        fields[field.name] = None if target not in ids else _new_id(ids, target, fields[field.name])
    for field in model._meta.many_to_many:
        target = field.remote_field.model._meta.label_lower
        fields[field.name] = [_new_id(ids, target, value) for value in fields.get(field.name) or []]
    # Remembered Revolut products hold account ids in JSON. Nothing depends on
    # one that's gone: the mapping just asks again.
    if "product_accounts" in fields:
        accounts = ids["accounts.account"]
        fields["product_accounts"] = {
            product: accounts.get(account) for product, account in (fields["product_accounts"] or {}).items()
        }
    if model.household_path == "household":
        fields["household"] = household.pk
    return {"model": row["model"], "pk": ids[row["model"]][row.get("pk")], "fields": fields}


def restore_backup(rows):
    """Replace the current household's data with `rows` (from read_backup), all
    or nothing. Returns the restored counts; raises BackupError."""
    household = current_household()
    with household_lock() as acquired:
        if not acquired:
            raise BackupError(SYNC_RUNNING)
        try:
            with transaction.atomic(), connection.cursor() as cursor:
                # Checked at the end, so rows can go in any order, and a dangling
                # link fails here and rolls back rather than at a later commit.
                cursor.execute("SET CONSTRAINTS ALL DEFERRED")
                ids = _new_ids(rows)
                rewritten = [_rewritten(row, ids, household) for row in rows]
                clear_household(household)
                objects = list(serializers.deserialize("python", rewritten, ignorenonexistent=True))
                for obj in objects:
                    obj.save()
                cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
                cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        except DatabaseError:
            raise BackupError(NOT_SAVED) from None

    Account = apps.get_model("accounts.Account")
    Transaction = apps.get_model("transactions.Transaction")
    # Counted as the summary counts them: no off-bank account, and no
    # covered entries, which live in it.
    off_bank = {o.object.pk for o in objects if isinstance(o.object, Account) and o.object.is_off_bank}
    return {
        "accounts": sum(isinstance(o.object, Account) and not o.object.is_off_bank for o in objects),
        "transactions": sum(
            isinstance(o.object, Transaction) and o.object.split_parent_id is None and o.object.account_id not in off_bank
            for o in objects
        ),
    }

import json
from datetime import date
from datetime import datetime
from datetime import timezone as dt_timezone

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import BudgetSettings, Category, CategoryLimit, YearlyBudget
from forecasting.models import RecurringTransaction
from imports.models import AccountImportSettings, ImportSession
from transactions.adjustments import set_value
from transactions.models import Transaction
from transactions.splits import SplitLine, save_split
from transactions.transfers import link_transfer

from .format import (
    BACKED_UP_MODELS,
    DATA_APPS,
    EXCLUDED_MODELS,
    NEWER,
    NOT_A_BACKUP,
    NOT_SAVED,
    UNREADABLE,
    BackupError,
    backed_up_models,
    build_backup,
    dump_backup,
    read_backup,
    restore_backup,
)


def snapshot():
    """Every backed-up row, as stored, plus where each import went."""
    rows = {model._meta.label: list(model.objects.order_by("pk").values()) for model in backed_up_models()}
    # A backup never keeps the bank file an import came from.
    for row in rows["imports.ImportSession"]:
        row.update(raw_content="", candidates=[])
    rows["imported_accounts"] = list(
        ImportSession.imported_accounts.through.objects.order_by("pk").values("importsession_id", "account_id")
    )
    return rows


class BackupModelsTests(TestCase):
    def test_every_data_model_is_backed_up_or_excluded(self):
        decided = set(BACKED_UP_MODELS) | set(EXCLUDED_MODELS)
        for app_label in DATA_APPS:
            for model in apps.get_app_config(app_label).get_models():
                self.assertIn(model._meta.label, decided, f"Decide whether {model._meta.label} goes in a backup")


class BackupTestCase(TestCase):
    def setUp(self):
        self.crelan = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=10000)
        self.revolut = Account.objects.create(name="Revolut", account_type="checking", starting_balance_cents=0)
        self.house = Account.objects.create(name="House", account_type="property", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        self.household = Category.objects.create(name="Household")
        self.tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        self.tab = Category.objects.create(name="Jan", parent=self.tabs)
        CategoryLimit.objects.create(category=self.groceries, limit_cents=40000)
        CategoryLimit.objects.create(category=self.groceries, month=date(2026, 10, 1), limit_cents=45000)
        self.groceries.budget_kind = Category.BudgetKind.MONTHLY
        YearlyBudget.objects.create(category=self.household, from_year=2026, amount_cents=120000, due_month=3, due_day=1)
        settings = BudgetSettings.load()
        settings.start_month = date(2026, 1, 1)
        settings.save()
        RecurringTransaction.objects.create(
            account=self.crelan, amount_cents=-80000, payee="Rent", category=self.household,
            frequency="monthly", start_date=date(2026, 1, 1),
        )

        transfer = self.txn(self.crelan, -5000, "To Revolut")
        link_transfer(transfer, self.revolut)
        supermarket = self.txn(self.crelan, -6000, "Delhaize")
        save_split(supermarket, [SplitLine(-4000, category=self.groceries), SplitLine(-2000, category=self.household)])
        self.txn(
            self.revolut, -1200, "Coffee Co.", category=self.groceries, category_confirmed=False,
            category_source=Transaction.CategorySource.AI, category_reason="Looks like groceries",
        )
        self.txn(self.revolut, -300, "Jan", category=self.tab, notes="lent")
        set_value(self.house, date(2026, 10, 1), 29500000)

        session = ImportSession.objects.create(
            account=self.crelan, file_format="csv", raw_content="Datum;Bedrag\n01/10/2026;-60,00",
            status=ImportSession.Status.COMMITTED, candidates=[{"index": 0, "payee": "Delhaize"}],
        )
        session.imported_accounts.set([self.crelan, self.revolut])
        ImportSession.objects.filter(pk=session.pk).update(updated_at=datetime(2026, 10, 20, 9, tzinfo=dt_timezone.utc))
        AccountImportSettings.objects.create(
            account=self.revolut, csv_mapping={"date": "Datum"}, product_accounts={"Savings": None}
        )

    def txn(self, account, amount_cents, payee, **kwargs):
        return Transaction.objects.create(
            account=account, date=date(2026, 10, 5), amount_cents=amount_cents, payee=payee, **kwargs
        )

    def file_content(self):
        return dump_backup(build_backup()).encode()

    def mess_up(self):
        """Change the data after the backup was made."""
        Account.objects.filter(pk=self.revolut.pk).delete()
        Category.objects.create(name="New")
        self.txn(self.crelan, -999, "After the backup")
        ImportSession.objects.create(account=self.crelan, file_format="csv", raw_content="pending")


class BuildBackupTests(BackupTestCase):
    def test_the_envelope(self):
        backup = build_backup()
        self.assertEqual(backup["app"], "reconciled")
        self.assertEqual(backup["format_version"], 1)
        self.assertEqual(backup["migrations"]["imports"], "0004_backfill_imported_accounts")
        self.assertEqual(set(backup["migrations"]), set(DATA_APPS))
        # A transfer (2 sides), the split (its parts are inside it), the AI
        # guess, the tab row and the house's value adjustment.
        self.assertEqual(backup["summary"], {"accounts": 3, "transactions": 6})

    def test_every_backed_up_row_is_in_it_with_its_id_and_times(self):
        data = build_backup()["data"]
        for model in backed_up_models():
            rows = [row for row in data if row["model"] == model._meta.label_lower]
            self.assertEqual([row["pk"] for row in rows], list(model.objects.order_by("pk").values_list("pk", flat=True)))
        account = next(row for row in data if row["model"] == "accounts.account")
        self.assertEqual(account["fields"]["created_at"], self.crelan.created_at)

    def test_no_users_or_passwords(self):
        get_user_model().objects.create_user(username="budgeter", password="secret-password")
        content = self.file_content().decode()
        self.assertNotIn("budgeter", content)
        self.assertNotIn("pbkdf2", content)
        self.assertNotIn('"auth.', content)

    def test_an_unfinished_import_and_bank_files_are_left_out(self):
        pending = ImportSession.objects.create(account=self.crelan, file_format="csv", raw_content="Datum;Bedrag")
        sessions = [row for row in build_backup()["data"] if row["model"] == "imports.importsession"]
        self.assertNotIn(pending.pk, [row["pk"] for row in sessions])
        self.assertEqual([(row["fields"]["raw_content"], row["fields"]["candidates"]) for row in sessions], [("", [])])

    def test_timestamps_keep_their_microseconds(self):
        content = self.file_content().decode()
        self.assertIn(self.crelan.created_at.isoformat(), content)


class ReadBackupTests(BackupTestCase):
    def assertRefused(self, content, message):
        before = snapshot()
        with self.assertRaises(BackupError) as caught:
            read_backup(content)
        self.assertEqual(str(caught.exception), message)
        self.assertEqual(snapshot(), before)

    def envelope(self, **changes):
        return json.dumps({**json.loads(self.file_content()), **changes})

    def test_a_bank_csv_is_not_a_backup(self):
        self.assertRefused(b"Datum;Bedrag;Tegenpartij\n01/10/2026;-6,00;Delhaize\n", NOT_A_BACKUP)

    def test_other_json_is_not_a_backup(self):
        self.assertRefused(b'{"accounts": []}', NOT_A_BACKUP)

    def test_a_cut_off_file_cant_be_read(self):
        content = self.file_content()
        self.assertRefused(content[: len(content) // 2], UNREADABLE)

    def test_a_newer_format_version_is_refused(self):
        self.assertRefused(self.envelope(format_version=2), NEWER)

    def test_a_backup_from_a_newer_app_is_refused(self):
        migrations = {**json.loads(self.file_content())["migrations"], "accounts": "0099_from_the_future"}
        self.assertRefused(self.envelope(migrations=migrations), NEWER)

    def test_a_model_that_isnt_backed_up_is_refused(self):
        row = {"model": "auth.user", "pk": 1, "fields": {"username": "intruder"}}
        self.assertRefused(self.envelope(data=[row]), UNREADABLE)

    def test_a_bad_value_is_refused(self):
        data = json.loads(self.file_content())["data"]
        account = next(row for row in data if row["model"] == "accounts.account")
        account["fields"]["starting_balance_cents"] = "lots"
        self.assertRefused(self.envelope(data=data), UNREADABLE)


class RestoreBackupTests(BackupTestCase):
    def test_a_round_trip_gives_back_the_same_rows(self):
        before = snapshot()
        content = self.file_content()
        self.mess_up()

        restored = restore_backup(read_backup(content))

        self.assertEqual(snapshot(), before)
        self.assertEqual(restored, {"accounts": 3, "transactions": 6})

    def test_links_survive(self):
        content = self.file_content()
        self.mess_up()
        restore_backup(read_backup(content))

        transfer = Transaction.objects.get(payee="To Revolut")
        self.assertEqual(transfer.transfer_counterpart.account, self.revolut)
        self.assertEqual(transfer.transfer_counterpart.transfer_counterpart, transfer)
        parts = Transaction.objects.get(payee="Delhaize", split_parent=None).parts.order_by("amount_cents")
        self.assertEqual([(p.amount_cents, p.category.name) for p in parts], [(-4000, "Groceries"), (-2000, "Household")])
        guess = Transaction.objects.get(payee="Coffee Co.")
        self.assertEqual((guess.category_confirmed, guess.category_reason), (False, "Looks like groceries"))
        self.assertEqual(self.house.current_balance_cents, 29500000)

    def test_the_last_import_date_survives(self):
        client = APIClient()
        client.force_authenticate(get_user_model().objects.create_user(username="u", password="x"))
        content = self.file_content()
        self.mess_up()
        restore_backup(read_backup(content))

        response = client.get(reverse("report-overview"), {"month": "2026-10"})
        dates = {a["name"]: a["last_import_date"] for a in response.json()["accounts"]}
        self.assertEqual(dates["Crelan"], "2026-10-20")
        self.assertEqual(dates["Revolut"], "2026-10-20")

    def test_an_unfinished_import_is_gone(self):
        content = self.file_content()
        self.mess_up()
        restore_backup(read_backup(content))
        self.assertFalse(ImportSession.objects.filter(status=ImportSession.Status.PENDING).exists())

    def test_new_rows_after_a_restore_dont_clash(self):
        content = self.file_content()
        restore_backup(read_backup(content))
        account = Account.objects.create(name="Cash", account_type="cash", starting_balance_cents=0)
        txn = self.txn(account, -500, "Bakery")
        category = Category.objects.create(name="Bakery")
        session = ImportSession.objects.create(account=account, file_format="csv", raw_content="")
        session.imported_accounts.add(account)
        self.assertGreater(txn.pk, Transaction.objects.exclude(pk=txn.pk).latest("pk").pk)
        self.assertGreater(category.pk, self.tab.pk)

    def test_a_dangling_link_changes_nothing(self):
        envelope = json.loads(self.file_content())
        envelope["data"] = [
            row for row in envelope["data"] if not (row["model"] == "accounts.account" and row["pk"] == self.revolut.pk)
        ]
        objects = read_backup(json.dumps(envelope))
        self.mess_up()
        before = snapshot()

        with self.assertRaises(BackupError) as caught:
            restore_backup(objects)

        self.assertEqual(str(caught.exception), NOT_SAVED)
        self.assertEqual(snapshot(), before)

    def test_an_older_backup_takes_defaults_for_new_fields(self):
        envelope = json.loads(self.file_content())
        for row in envelope["data"]:
            if row["model"] == "transactions.transaction":
                del row["fields"]["category_reason"]
        restore_backup(read_backup(json.dumps(envelope)))
        self.assertEqual(set(Transaction.objects.values_list("category_reason", flat=True)), {""})

    def test_a_field_removed_since_is_ignored(self):
        envelope = json.loads(self.file_content())
        for row in envelope["data"]:
            if row["model"] == "accounts.account":
                row["fields"]["colour"] = "teal"
        restore_backup(read_backup(json.dumps(envelope)))
        self.assertEqual(Account.objects.count(), 3)


class BackupApiTests(BackupTestCase):
    def setUp(self):
        super().setUp()
        get_user_model().objects.create_user(username="budgeter", password="pw-for-tests")
        self.client = APIClient()
        self.client.login(username="budgeter", password="pw-for-tests")

    def upload(self, content, client=None):
        file_obj = SimpleUploadedFile("reconciled-backup-2026-10-25.json", content, content_type="application/json")
        return (client or self.client).post(reverse("backup-restore"), {"file": file_obj}, format="multipart")

    def test_download(self):
        response = self.client.get(reverse("backup"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertRegex(
            response["Content-Disposition"], r'^attachment; filename="reconciled-backup-\d{4}-\d{2}-\d{2}\.json"$'
        )
        body = json.loads(response.content)
        self.assertEqual(body["summary"], {"accounts": 3, "transactions": 6})

    def test_download_needs_a_session(self):
        response = APIClient().get(reverse("backup"))
        self.assertEqual(response.status_code, 401)
        self.assertNotIn(b"Crelan", response.content)

    def test_restore(self):
        content = self.client.get(reverse("backup")).content
        self.mess_up()

        response = self.upload(content)

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), {"accounts": 3, "transactions": 6})
        self.assertTrue(Account.objects.filter(name="Revolut").exists())
        # Still signed in: the same session keeps working.
        self.assertEqual(self.client.get(reverse("auth-me")).status_code, 200)

    def test_restore_a_damaged_file(self):
        content = self.client.get(reverse("backup")).content
        response = self.upload(content[:100])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], UNREADABLE)
        self.assertEqual(Account.objects.count(), 3)

    def test_restore_from_a_newer_version(self):
        envelope = json.loads(self.client.get(reverse("backup")).content)
        envelope["format_version"] = 2
        response = self.upload(json.dumps(envelope).encode())
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], NEWER)

    def test_restore_without_a_file(self):
        response = self.client.post(reverse("backup-restore"), {}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_restore_needs_a_session(self):
        content = self.client.get(reverse("backup")).content
        Category.objects.create(name="Kept")
        response = self.upload(content, client=APIClient())
        self.assertEqual(response.status_code, 401)
        self.assertTrue(Category.objects.filter(name="Kept").exists())

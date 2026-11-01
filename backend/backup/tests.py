import json
from dataclasses import replace
from datetime import date
from datetime import datetime
from datetime import timezone as dt_timezone

from unittest import mock

from cryptography.fernet import Fernet
from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from decimal import Decimal

from accounts.models import Account, Loan, LoanCorrection
from banksync.models import BankCredentials
from budgets.models import BudgetSettings, Category, CategoryLimit, YearlyBudget
from forecasting.models import RecurringTransaction
from households.context import household_context
from households.models import Household
from households.testing import TestCase
from imports.models import AccountImportSettings, ImportSession
from transactions.adjustments import set_value
from transactions.loans import link_payment, schedule, set_up_loan, sync_loan
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
    SYNC_RUNNING,
    UNREADABLE,
    BackupError,
    backed_up_models,
    build_backup,
    dump_backup,
    read_backup,
    restore_backup,
)


def snapshot():
    """Every backed-up row, as stored, plus where each import went. A restore
    gives rows new ids in the same order, so ids are shown as positions."""
    rows = {model._meta.label: list(model.objects.order_by("pk").values()) for model in backed_up_models()}
    positions = {
        model: {row["id"]: position for position, row in enumerate(rows[model._meta.label])}
        for model in backed_up_models()
    }
    for model in backed_up_models():
        for row in rows[model._meta.label]:
            row["id"] = positions[model][row["id"]]
            for field in model._meta.concrete_fields:
                if field.remote_field and field.remote_field.model in positions and row[field.attname] is not None:
                    row[field.attname] = positions[field.remote_field.model][row[field.attname]]
    # A backup never keeps the bank file an import came from.
    for row in rows["imports.ImportSession"]:
        row.update(raw_content="", candidates=[])
    rows["imported_accounts"] = [
        (positions[ImportSession][link["importsession_id"]], positions[Account][link["account_id"]])
        for link in ImportSession.imported_accounts.through.objects.order_by("pk").values(
            "importsession_id", "account_id"
        )
    ]
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
        self.assertEqual(backup["format_version"], 2)
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
        self.assertRefused(self.envelope(format_version=3), NEWER)

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
        self.assertEqual(transfer.transfer_counterpart.account.name, "Revolut")
        self.assertEqual(transfer.transfer_counterpart.transfer_counterpart, transfer)
        parts = Transaction.objects.get(payee="Delhaize", split_parent=None).parts.order_by("amount_cents")
        self.assertEqual([(p.amount_cents, p.category.name) for p in parts], [(-4000, "Groceries"), (-2000, "Household")])
        guess = Transaction.objects.get(payee="Coffee Co.")
        self.assertEqual((guess.category_confirmed, guess.category_reason), (False, "Looks like groceries"))
        self.assertEqual(Account.objects.get(name="House").current_balance_cents, 29500000)

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
        self.assertGreater(category.pk, Category.objects.exclude(pk=category.pk).latest("pk").pk)

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
        envelope["format_version"] = 3
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


class LoanBackupTests(BackupTestCase):
    """The data-backup spec's "A loan schedule survives"."""

    def test_a_loan_schedule_survives(self):
        mortgage = Account.objects.create(name="Mortgage", account_type="loan", starting_balance_cents=0)
        loan = set_up_loan(
            mortgage, date(2026, 10, 20), principal_cents=20000000, annual_rate=Decimal("3.00"), term_months=300,
            first_payment_date=date(2026, 11, 2), paid_from=self.crelan, payment_category=self.household,
        )
        Transaction.objects.create(account=self.crelan, date=date(2026, 11, 3), amount_cents=-94422, payee="BNP")
        late = Transaction.objects.create(account=self.crelan, date=date(2026, 12, 9), amount_cents=-94422, payee="BNP")
        sync_loan(loan, date(2026, 12, 12))
        link_payment(loan, 2, late)
        before = snapshot()
        content = self.file_content()
        self.mess_up()

        restore_backup(read_backup(content))

        self.assertEqual(snapshot(), before)
        restored = Loan.objects.get()
        sync_loan(restored, date(2026, 12, 12))
        self.assertEqual(snapshot(), before)
        posted = {
            t.loan_installment: (t.loan_payment.date if t.loan_payment else None, t.loan_linked_by_hand)
            for t in Transaction.objects.filter(loan=restored).select_related("loan_payment")
        }
        self.assertEqual(posted, {0: (None, False), 1: (date(2026, 11, 3), False), 2: (date(2026, 12, 9), True)})

    def test_a_correction_survives(self):
        mortgage = Account.objects.create(name="Mortgage", account_type="loan", starting_balance_cents=0)
        loan = set_up_loan(
            mortgage, date(2026, 10, 20), principal_cents=20000000, annual_rate=Decimal("3.00"), term_months=300,
            first_payment_date=date(2026, 11, 2), paid_from=self.crelan,
        )
        correction = LoanCorrection.objects.create(
            loan=loan, date=date(2026, 11, 12), balance_cents=17000000, payment_cents=84990
        )
        Transaction.objects.create(
            account=mortgage, date=date(2026, 11, 12), amount_cents=0, payee="Value adjustment",
            is_adjustment=True, adjustment_value_cents=-17000000, loan=loan, loan_correction=correction,
        )
        before, installments = snapshot(), schedule(loan)
        content = self.file_content()
        self.mess_up()

        restore_backup(read_backup(content))

        self.assertEqual(snapshot(), before)
        restored = Loan.objects.get()
        self.assertEqual(
            [replace(i, correction_id=None) for i in schedule(restored)],
            [replace(i, correction_id=None) for i in installments],
        )
        self.assertEqual(Transaction.objects.get(loan_correction__isnull=False).loan_correction_id, LoanCorrection.objects.get().pk)


class TwoHouseholdsTests(BackupTestCase):
    def setUp(self):
        super().setUp()
        self.other = Household.objects.create(name="The Peeters household")
        with household_context(self.other):
            self.their_account = Account.objects.create(name="Theirs", account_type="checking", starting_balance_cents=7)
            Category.objects.create(name="Groceries")

    def their_rows(self):
        with household_context(self.other):
            return list(Account.objects.values()), list(Category.objects.values())

    def test_a_backup_holds_this_household_only(self):
        text = dump_backup(build_backup())
        self.assertNotIn("Theirs", text)
        self.assertNotIn('"household_id"', text)

    def test_a_backup_names_its_household(self):
        self.assertEqual(build_backup()["household"], self.default_household.name)

    def test_a_restore_leaves_other_households_alone(self):
        before = self.their_rows()
        content = self.file_content()
        self.mess_up()
        restore_backup(read_backup(content))
        self.assertEqual(self.their_rows(), before)

    def test_a_backup_restores_into_another_household(self):
        content = self.file_content()
        with household_context(self.other):
            restore_backup(read_backup(content))
            self.assertEqual(Account.objects.count(), 3)
            self.assertTrue(Transaction.objects.filter(payee="To Revolut", transfer_counterpart__isnull=False).exists())
        self.assertEqual(Account.objects.count(), 3)

    def test_a_row_pointing_at_another_households_account_is_refused(self):
        envelope = json.loads(self.file_content())
        for row in envelope["data"]:
            if row["model"] == "transactions.transaction":
                row["fields"]["account"] = self.their_account.pk
        before = self.their_rows(), snapshot()
        with self.assertRaisesMessage(BackupError, NOT_SAVED):
            restore_backup(read_backup(json.dumps(envelope)))
        self.assertEqual((self.their_rows(), snapshot()), before)

    def test_a_household_in_the_file_is_ignored(self):
        envelope = json.loads(self.file_content())
        for row in envelope["data"]:
            if row["model"] == "accounts.account":
                row["fields"]["household"] = self.other.pk
        before = self.their_rows()
        restore_backup(read_backup(json.dumps(envelope)))
        self.assertEqual(self.their_rows(), before)
        self.assertEqual(Account.objects.count(), 3)

    def test_a_backup_from_before_households_restores(self):
        envelope = json.loads(self.file_content())
        envelope["format_version"] = 1
        envelope.pop("household")
        before = snapshot()
        self.mess_up()
        restore_backup(read_backup(json.dumps(envelope)))
        self.assertEqual(Account.objects.count(), 3)
        self.assertEqual(len(snapshot()["accounts.Account"]), len(before["accounts.Account"]))

    def test_remembered_accounts_follow_the_restore(self):
        pockets = self.revolut
        AccountImportSettings.objects.create(
            account=self.crelan, product_accounts={"Pockets": pockets.pk, "Skipped": None, "Gone": 999999}
        )
        content = self.file_content()
        self.mess_up()
        restore_backup(read_backup(content))
        remembered = AccountImportSettings.objects.get(account__name="Crelan").product_accounts
        self.assertEqual(remembered["Pockets"], Account.objects.get(name="Revolut").pk)
        self.assertIsNone(remembered["Skipped"])
        self.assertIsNone(remembered["Gone"])

    def test_a_restore_during_a_sync_is_refused(self):
        content = self.file_content()
        before = snapshot()
        with mock.patch("backup.format.household_lock") as lock:
            lock.return_value.__enter__.return_value = False
            with self.assertRaisesMessage(BackupError, SYNC_RUNNING):
                restore_backup(read_backup(content))
        self.assertEqual(snapshot(), before)

    @override_settings(HOUSEHOLD_ENCRYPTION_KEYS=[Fernet.generate_key().decode()])
    def test_credentials_and_the_ai_choice_stay(self):
        BankCredentials.objects.create(app_id="app", private_key="key")
        Household.objects.filter(pk=self.default_household.pk).update(ai_enabled=False)
        restore_backup(read_backup(self.file_content()))
        self.assertEqual(BankCredentials.objects.get().private_key, "key")
        self.assertFalse(Household.objects.get(pk=self.default_household.pk).ai_enabled)
        self.assertNotIn("ai_enabled", self.file_content().decode())

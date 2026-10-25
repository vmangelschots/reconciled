from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category
from transactions.models import Transaction

from .models import AccountImportSettings, ImportSession
from .tests import csv_file
from .tests_presets import CRELAN_HEADER, REVOLUT_HEADER, REVOLUT_SAMPLE

CRELAN_EXPORT = (
    CRELAN_HEADER
    + "\n01/10/2026;-21.85;1000.00;EUR;Ethias;BE00 0000 0000 0000;Overschrijving;Verzekeringstaks;BE11 1111 1111 1111"
    + "\n02/10/2026;-.99;999.01;EUR;;;Beheerskosten;;BE11 1111 1111 1111\n"
)
CURRENT_ONLY = (
    REVOLUT_HEADER
    + "\nCard Payment,Current,2026-09-30 7:25:54,2026-10-01 9:52:59,Vanalles & Nogwat,-3.6,0,EUR,COMPLETED,144.46"
    + "\nCard Payment,Current,2026-10-22 18:00:14,2026-10-23 10:09:10,OPC Parkeren,-22,0,EUR,COMPLETED,135.87\n"
)
SIMPLE_CSV = "Posted Date,Amount,Description\n2026-01-15,-42.50,Grocery Store\n"
SIMPLE_MAPPING = {"date": "Posted Date", "date_format": "YYYY-MM-DD", "amount": "Amount", "description": "Description"}


class BankExportTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.revolut = Account.objects.create(name="Revolut", account_type="checking", starting_balance_cents=0)
        self.pockets = Account.objects.create(name="Revolut Pockets", account_type="savings", starting_balance_cents=0)

    def upload(self, content, account=None):
        response = self.client.post(
            reverse("importsession-list"),
            {"account": (account or self.revolut).id, "file": csv_file(content)},
            format="multipart",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def assign(self, session_id, product_accounts):
        return self.client.post(
            reverse("importsession-assign", args=[session_id]),
            {"product_accounts": product_accounts},
            format="json",
        )

    def map(self, session_id, mapping=SIMPLE_MAPPING):
        return self.client.post(reverse("importsession-map", args=[session_id]), mapping, format="json")

    def commit(self, session_id, indices):
        response = self.client.post(
            reverse("importsession-commit", args=[session_id]), {"selected_indices": list(indices)}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def revolut_preview(self):
        """The sample with Current to "Revolut" and Savings to "Revolut Pockets"."""
        session = self.upload(REVOLUT_SAMPLE)
        response = self.assign(session["id"], {"Current": self.revolut.id, "Savings": self.pockets.id})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()


class RecognizeExportTests(BankExportTestCase):
    def test_a_revolut_export_skips_mapping(self):
        session = self.upload(CURRENT_ONLY)
        self.assertEqual(session["preset"], "revolut")
        self.assertEqual(session["preset_label"], "Revolut")
        self.assertNotIn("columns", session)
        self.assertEqual(len(session["candidates"]), 2)

    def test_a_crelan_export_skips_mapping(self):
        session = self.upload(CRELAN_EXPORT)
        self.assertEqual(session["preset_label"], "Crelan")
        self.assertEqual(
            [(c["date"], c["amount_cents"], c["payee"]) for c in session["candidates"]],
            [("2026-10-01", -2185, "Ethias"), ("2026-10-02", -99, "Beheerskosten")],
        )

    def test_other_files_are_mapped_as_before(self):
        session = self.upload(SIMPLE_CSV)
        self.assertIsNone(session["preset_label"])
        self.assertEqual(session["columns"], ["Posted Date", "Amount", "Description"])
        self.assertEqual(session["candidates"], [])

    def test_a_recognized_export_takes_no_mapping(self):
        session = self.upload(CRELAN_EXPORT)
        self.assertEqual(self.map(session["id"]).status_code, 400)


class RevolutProductTests(BankExportTestCase):
    def test_several_products_ask_before_the_preview(self):
        session = self.upload(REVOLUT_SAMPLE)
        self.assertEqual(session["products"], ["Savings", "Current"])
        self.assertEqual(session["product_accounts"], {"Current": self.revolut.id})
        self.assertEqual(session["candidates"], [])

    def test_current_and_savings_in_one_file(self):
        candidates = self.revolut_preview()["candidates"]
        by_account = {}
        for c in candidates:
            by_account.setdefault(c["account_name"], []).append(c["payee"])
        self.assertEqual(
            by_account["Revolut Pockets"], ["Luminus SA", "To pocket EUR Electricity from EUR"]
        )
        self.assertEqual(len(by_account["Revolut"]), 5)

    def test_skip_a_product(self):
        session = self.upload(REVOLUT_SAMPLE)
        candidates = self.assign(session["id"], {"Current": self.revolut.id, "Savings": None}).json()["candidates"]
        self.assertEqual({c["account_name"] for c in candidates}, {"Revolut"})
        self.assertEqual(len(candidates), 5)

    def test_only_the_current_account(self):
        session = self.upload(CURRENT_ONLY)
        self.assertNotIn("products", session)
        self.assertEqual({c["account_id"] for c in session["candidates"]}, {self.revolut.id})

    def test_a_new_product_must_be_chosen(self):
        session = self.upload(REVOLUT_SAMPLE)
        response = self.assign(session["id"], {"Current": self.revolut.id})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Savings", response.json()["detail"])

    def test_an_archived_account_is_refused(self):
        self.pockets.archived = True
        self.pockets.save()
        session = self.upload(REVOLUT_SAMPLE)
        response = self.assign(session["id"], {"Current": self.revolut.id, "Savings": self.pockets.id})
        self.assertEqual(response.status_code, 400)

    def test_duplicates_are_looked_for_in_each_lines_account(self):
        Transaction.objects.create(account=self.pockets, date="2026-10-12", amount_cents=-25472, payee="Luminus SA")
        candidates = self.revolut_preview()["candidates"]
        luminus = next(c for c in candidates if c["payee"] == "Luminus SA")
        self.assertTrue(luminus["is_duplicate"])


@override_settings(OPENAI_API_KEY="")
class PocketMoveCommitTests(BankExportTestCase):
    def setUp(self):
        super().setUp()
        Category.objects.create(name="Utilities")

    def test_money_moved_into_a_pocket(self):
        candidates = self.revolut_preview()["candidates"]
        out = next(c for c in candidates if c["amount_cents"] == -35000)
        into = next(c for c in candidates if c["amount_cents"] == 35000)
        self.assertEqual(out["pocket_pair"], {"index": into["index"], "account_name": "Revolut Pockets"})
        self.assertEqual(into["pocket_pair"], {"index": out["index"], "account_name": "Revolut"})

        self.commit(self.session_id(), [c["index"] for c in candidates])

        sent = Transaction.objects.get(account=self.revolut, amount_cents=-35000)
        received = Transaction.objects.get(account=self.pockets, amount_cents=35000)
        self.assertEqual(sent.transfer_counterpart, received)
        self.assertEqual(received.transfer_counterpart, sent)
        self.assertIsNone(sent.category)
        self.assertIsNone(received.category)
        self.assertFalse(sent.created_by_transfer or received.created_by_transfer)

    def test_only_one_side_committed(self):
        candidates = self.revolut_preview()["candidates"]
        into = next(c for c in candidates if c["amount_cents"] == 35000)
        self.commit(self.session_id(), [c["index"] for c in candidates if c is not into])

        sent = Transaction.objects.get(account=self.revolut, amount_cents=-35000)
        self.assertIsNone(sent.transfer_counterpart)
        self.assertFalse(Transaction.objects.filter(account=self.pockets, amount_cents=35000).exists())

    def test_a_pocket_move_stays_a_transfer(self):
        # History that would otherwise categorize the pocket move.
        utilities = Category.objects.get(name="Utilities")
        Transaction.objects.create(
            account=self.revolut,
            date="2026-09-22",
            amount_cents=-35000,
            payee="To pocket EUR Electricity from EUR",
            category=utilities,
            category_confirmed=True,
        )
        candidates = self.revolut_preview()["candidates"]
        self.commit(self.session_id(), [c["index"] for c in candidates])

        moved = Transaction.objects.filter(payee="To pocket EUR Electricity from EUR", date="2026-10-22")
        self.assertEqual(moved.count(), 2)
        self.assertFalse(moved.exclude(category=None).exists())

    def test_an_import_into_two_accounts(self):
        candidates = self.revolut_preview()["candidates"]
        result = self.commit(self.session_id(), [c["index"] for c in candidates])

        self.assertEqual(result["created_count"], 7)
        self.assertEqual(Transaction.objects.filter(account=self.revolut).count(), 5)
        self.assertEqual(Transaction.objects.filter(account=self.pockets).count(), 2)
        session = ImportSession.objects.get(pk=self.session_id())
        self.assertEqual(set(session.imported_accounts.all()), {self.revolut, self.pockets})

    def test_a_skipped_products_account_is_not_imported(self):
        session = self.upload(REVOLUT_SAMPLE)
        candidates = self.assign(session["id"], {"Current": self.revolut.id, "Savings": None}).json()["candidates"]
        self.commit(session["id"], [c["index"] for c in candidates])
        self.assertEqual(list(ImportSession.objects.get(pk=session["id"]).imported_accounts.all()), [self.revolut])

    def session_id(self):
        return ImportSession.objects.latest("created_at").pk


@override_settings(OPENAI_API_KEY="")
class RememberedChoicesTests(BankExportTestCase):
    def setUp(self):
        super().setUp()
        self.joint = Account.objects.create(name="Joint", account_type="checking", starting_balance_cents=0)

    def import_simple(self, account, mapping):
        session = self.upload(SIMPLE_CSV, account)
        candidates = self.map(session["id"], mapping).json()["candidates"]
        self.commit(session["id"], [c["index"] for c in candidates])

    def test_second_upload_is_preselected(self):
        mapping = {**SIMPLE_MAPPING, "date_format": "DD/MM/YYYY"}
        session = self.upload("Posted Date,Amount,Description\n15/01/2026,-42.50,Grocery Store\n", self.joint)
        candidates = self.map(session["id"], mapping).json()["candidates"]
        self.commit(session["id"], [c["index"] for c in candidates])

        again = self.upload(SIMPLE_CSV, self.joint)
        self.assertEqual(again["saved_mapping"]["date"], "Posted Date")
        self.assertEqual(again["saved_mapping"]["amount"], "Amount")
        self.assertEqual(again["saved_mapping"]["description"], "Description")
        self.assertEqual(again["saved_mapping"]["date_format"], "DD/MM/YYYY")

    def test_different_columns_start_empty(self):
        self.import_simple(self.joint, SIMPLE_MAPPING)
        other = self.upload("Date,Amount,Description\n2026-01-15,-42.50,Grocery Store\n", self.joint)
        self.assertIsNone(other["saved_mapping"])

    def test_remembered_per_account(self):
        self.import_simple(self.joint, SIMPLE_MAPPING)
        savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        self.assertIsNone(self.upload(SIMPLE_CSV, savings)["saved_mapping"])

    def test_an_uncommitted_import_remembers_nothing(self):
        session = self.upload(SIMPLE_CSV, self.joint)
        self.map(session["id"])
        self.assertIsNone(self.upload(SIMPLE_CSV, self.joint)["saved_mapping"])
        self.assertFalse(AccountImportSettings.objects.exists())

    def test_the_second_revolut_import_remembers(self):
        session = self.upload(REVOLUT_SAMPLE)
        candidates = self.assign(session["id"], {"Current": self.revolut.id, "Savings": self.pockets.id}).json()[
            "candidates"
        ]
        self.commit(session["id"], [c["index"] for c in candidates])

        again = self.upload(REVOLUT_SAMPLE)
        self.assertEqual(again["product_accounts"], {"Savings": self.pockets.id, "Current": self.revolut.id})

    def test_a_remembered_skip_is_preselected(self):
        session = self.upload(REVOLUT_SAMPLE)
        candidates = self.assign(session["id"], {"Current": self.revolut.id, "Savings": None}).json()["candidates"]
        self.commit(session["id"], [c["index"] for c in candidates])

        self.assertEqual(self.upload(REVOLUT_SAMPLE)["product_accounts"], {"Savings": None, "Current": self.revolut.id})

    def test_an_archived_remembered_account_is_no_choice(self):
        AccountImportSettings.objects.create(account=self.revolut, product_accounts={"Savings": self.pockets.id})
        self.pockets.archived = True
        self.pockets.save()
        self.assertEqual(self.upload(REVOLUT_SAMPLE)["product_accounts"], {"Current": self.revolut.id})

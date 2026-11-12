from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from households.testing import TestCase
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category
from reports.balances import history_tier
from reports.spending import month_spending

from . import covered
from .covered import CoveredError, CoveredInput
from .models import Transaction
from .tabs import tab_detail


class CoveredTestCase(TestCase):
    def setUp(self):
        self.joint = Account.objects.create(name="Joint", account_type="checking", starting_balance_cents=0)
        self.takeout = Category.objects.create(name="Takeout")
        self.tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        self.sarah = Category.objects.create(name="Sarah", parent=self.tabs)
        self.jan = Category.objects.create(name="Jan", parent=self.tabs)

    def entry(self, amount_cents=1500, day=11, category=None, payee="Sushi Palace", tab=None):
        return covered.create(
            tab or self.sarah,
            CoveredInput(date(2026, 11, day), payee, amount_cents, category or self.takeout),
        )

    def lend(self, amount_cents, day=3, tab=None):
        return Transaction.objects.create(
            account=self.joint, date=date(2026, 10, day), amount_cents=-amount_cents, payee="Pizzeria",
            category=tab or self.sarah,
        )


class OffBankAccountTests(CoveredTestCase):
    """1.1: the off-bank account is left out of visible() and stays at 0."""

    def test_visible_leaves_out_the_off_bank_account(self):
        self.entry()

        self.assertEqual(list(Account.objects.visible()), [self.joint])
        self.assertEqual(Account.objects.count(), 2)

    def test_its_balance_stays_zero(self):
        self.entry(1500)
        self.entry(2500, day=12)

        self.assertEqual(covered.off_bank_account().current_balance_cents, 0)

    def test_one_off_bank_account_per_household(self):
        self.entry()
        self.entry(day=12)

        self.assertEqual(Account.objects.filter(is_off_bank=True).count(), 1)


class PairLinkTests(CoveredTestCase):
    """1.2: the cost goes with its tab half."""

    def test_deleting_the_tab_half_deletes_the_cost(self):
        tab_row = self.entry()

        tab_row.delete()

        self.assertFalse(Transaction.objects.filter(account__is_off_bank=True).exists())


class RecordCoveredTests(CoveredTestCase):
    """"Record what the tab's person paid for" and "A covered entry's
    category is not a tab"."""

    def test_takeout_netted_against_an_open_tab(self):
        self.lend(1000)

        self.entry(1500)

        self.assertEqual(tab_detail(self.sarah).balance_cents, -500)
        spent, _ = month_spending(date(2026, 11, 1))
        self.assertEqual(spent[self.takeout.id], 1500)

    def test_the_tab_half_is_not_spending(self):
        self.entry(1500)

        spent, uncategorized = month_spending(date(2026, 11, 1))

        self.assertNotIn(self.sarah.id, spent)
        self.assertEqual(uncategorized, 0)

    def test_covered_on_a_settled_tab(self):
        self.lend(1000)
        Transaction.objects.create(
            account=self.joint, date=date(2026, 10, 5), amount_cents=1000, payee="SARAH", category=self.sarah
        )

        self.entry(2000, day=20, category=self.takeout, payee="Groceries")

        summary = tab_detail(self.sarah)
        self.assertEqual((summary.balance_cents, summary.open_since), (-2000, date(2026, 11, 20)))

    def test_repaying_a_covered_entry(self):
        self.lend(1000)
        self.entry(1500)

        Transaction.objects.create(
            account=self.joint, date=date(2026, 11, 20), amount_cents=-500, payee="SARAH", category=self.sarah
        )

        self.assertEqual(tab_detail(self.sarah).balance_cents, 0)

    def test_missing_amount_or_category(self):
        for amount, category, field in ((0, self.takeout, "amount_cents"), (-500, self.takeout, "amount_cents"),
                                        (1500, None, "category")):
            with self.subTest(field=field, amount=amount), self.assertRaises(CoveredError) as caught:
                covered.create(self.sarah, CoveredInput(date(2026, 11, 11), "Sushi", amount, category))
            self.assertEqual(caught.exception.field, field)

        self.assertFalse(Transaction.objects.exists())

    def test_a_tab_or_tab_group_is_rejected(self):
        for category in (self.jan, self.tabs):
            with self.subTest(category=category.name), self.assertRaises(CoveredError):
                self.entry(category=category)

        self.assertFalse(Transaction.objects.exists())


class EditCoveredTests(CoveredTestCase):
    def test_change_the_amount(self):
        tab_row = self.entry(1500)

        covered.update(tab_row, CoveredInput(date(2026, 11, 11), "Sushi Palace", 1200, self.takeout))

        self.assertEqual(tab_detail(self.sarah).balance_cents, -1200)
        spent, _ = month_spending(date(2026, 11, 1))
        self.assertEqual(spent[self.takeout.id], 1200)
        self.assertEqual(covered.off_bank_account().current_balance_cents, 0)

    def test_change_category_and_date_moves_both_halves(self):
        restaurants = Category.objects.create(name="Restaurants")
        tab_row = self.entry(1500)

        covered.update(tab_row, CoveredInput(date(2026, 12, 2), "Sushi Palace", 1500, restaurants))

        tab_row.refresh_from_db()
        cost = tab_row.covered_cost
        self.assertEqual((tab_row.date, cost.date, cost.category, tab_row.category),
                         (date(2026, 12, 2), date(2026, 12, 2), restaurants, self.sarah))

    def test_delete_both_halves(self):
        tab_row = self.entry(1500)

        covered.delete(tab_row)

        self.assertEqual(tab_detail(self.sarah).balance_cents, 0)
        spent, _ = month_spending(date(2026, 11, 1))
        self.assertNotIn(self.takeout.id, spent)


class OffBankIsNotAnAccountTests(CoveredTestCase):
    """"Covered entries are not in an account" in the accounts spec."""

    def setUp(self):
        super().setUp()
        self.api = APIClient()
        self.api.force_authenticate(get_user_model().objects.create_user(username="u", password="x"))
        self.revolut = Account.objects.create(name="Revolut", account_type="checking", starting_balance_cents=5000)
        self.entry()
        self.off_bank = covered.off_bank_account()

    def test_accounts_list(self):
        names = [a["name"] for a in self.api.get("/api/accounts/").json()]

        self.assertEqual(names, ["Joint", "Revolut"])

    def test_overview_accounts_and_balance(self):
        body = self.api.get("/api/reports/overview/", {"month": "2026-11"}).json()

        self.assertEqual([a["name"] for a in body["accounts"]], ["Joint", "Revolut"])
        self.assertEqual(body["balance_cents"], 5000)
        self.assertEqual([t["tier"] for t in body["tiers"]], ["everyday"])

    def test_no_ledger_of_its_own(self):
        self.assertEqual(self.api.get(f"/api/accounts/{self.off_bank.pk}/").status_code, 404)
        rows = self.api.get("/api/transactions/", {"account": self.off_bank.pk}).json()
        self.assertEqual(rows if isinstance(rows, list) else rows.get("results"), [])

    def test_not_a_transfer_target(self):
        row = Transaction.objects.create(account=self.joint, date=date(2026, 11, 2), amount_cents=-100, payee="x")

        response = self.api.post(f"/api/transactions/{row.pk}/transfer/", {"account": self.off_bank.pk}, format="json")

        self.assertEqual(response.status_code, 400)

    def test_no_manual_transaction_into_it(self):
        response = self.api.post(
            "/api/transactions/",
            {"account": self.off_bank.pk, "date": "2026-11-02", "amount_cents": -100, "payee": "x"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_not_a_forecast_or_import_account(self):
        self.assertEqual(self.api.get("/api/forecast/", {"account": self.off_bank.pk}).status_code, 404)
        upload = SimpleUploadedFile("a.csv", b"date,amount\n2026-01-01,1\n")
        response = self.api.post("/api/import-sessions/", {"account": self.off_bank.pk, "file": upload}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_net_worth_tier_with_only_savings(self):
        Account.objects.filter(is_off_bank=False).update(account_type="savings")

        self.assertEqual(history_tier(), "savings")

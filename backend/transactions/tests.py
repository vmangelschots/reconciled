from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category

from .models import Transaction


class TransactionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=100000
        )

    def test_create_expense_decreases_account_balance(self):
        response = self.client.post(
            reverse("transaction-list"),
            {
                "account": self.account.id,
                "date": "2026-01-15",
                "amount_cents": -4250,
                "payee": "Grocery Store",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance_cents, 100000 - 4250)

    def test_zero_amount_is_rejected(self):
        response = self.client.post(
            reverse("transaction-list"),
            {
                "account": self.account.id,
                "date": "2026-01-15",
                "amount_cents": 0,
                "payee": "Oops",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Transaction.objects.count(), 0)

    def test_missing_amount_is_rejected(self):
        response = self.client.post(
            reverse("transaction-list"),
            {"account": self.account.id, "date": "2026-01-15", "payee": "Oops"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_editing_amount_updates_balance(self):
        transaction = Transaction.objects.create(
            account=self.account, date="2026-01-15", amount_cents=-4250, payee="Grocery Store"
        )
        response = self.client.patch(
            reverse("transaction-detail", args=[transaction.id]),
            {"amount_cents": -4500},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance_cents, 100000 - 4500)

    def test_account_cannot_be_changed_on_edit(self):
        other_account = Account.objects.create(
            name="Savings", account_type="savings", starting_balance_cents=0
        )
        transaction = Transaction.objects.create(
            account=self.account, date="2026-01-15", amount_cents=-4250, payee="Grocery Store"
        )
        response = self.client.patch(
            reverse("transaction-detail", args=[transaction.id]),
            {"account": other_account.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_deleting_transaction_restores_balance(self):
        transaction = Transaction.objects.create(
            account=self.account, date="2026-01-15", amount_cents=-4250, payee="Grocery Store"
        )
        response = self.client.delete(reverse("transaction-detail", args=[transaction.id]))
        self.assertEqual(response.status_code, 204)
        self.account.refresh_from_db()
        self.assertEqual(self.account.current_balance_cents, 100000)

    def test_uncategorized_transaction_excluded_from_category_filter(self):
        groceries = Category.objects.create(name="Groceries")
        Transaction.objects.create(
            account=self.account,
            date="2026-01-15",
            amount_cents=-4250,
            payee="Grocery Store",
            category=groceries,
        )
        Transaction.objects.create(
            account=self.account, date="2026-01-16", amount_cents=-1000, payee="Misc"
        )

        all_response = self.client.get(reverse("transaction-list"))
        self.assertEqual(len(all_response.json()), 2)

        filtered_response = self.client.get(reverse("transaction-list"), {"category": groceries.id})
        payees = [t["payee"] for t in filtered_response.json()]
        self.assertEqual(payees, ["Grocery Store"])

    def test_filter_by_date_range_and_category(self):
        groceries = Category.objects.create(name="Groceries")
        other = Category.objects.create(name="Other")
        Transaction.objects.create(
            account=self.account, date="2026-01-10", amount_cents=-1000, payee="In range",
            category=groceries,
        )
        Transaction.objects.create(
            account=self.account, date="2026-02-10", amount_cents=-1000, payee="Out of range",
            category=groceries,
        )
        Transaction.objects.create(
            account=self.account, date="2026-01-12", amount_cents=-1000, payee="Wrong category",
            category=other,
        )

        response = self.client.get(
            reverse("transaction-list"),
            {"date_from": "2026-01-01", "date_to": "2026-01-31", "category": groceries.id},
        )
        payees = [t["payee"] for t in response.json()]
        self.assertEqual(payees, ["In range"])


class CategoryConfirmationTests(TestCase):
    """Writing a category through the API confirms it - see
    openspec/specs/auto-categorization and the transactions spec."""

    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )
        self.groceries = Category.objects.create(name="Groceries")
        self.household = Category.objects.create(name="Household")
        self.txn = Transaction.objects.create(
            account=self.account,
            date="2026-10-02",
            amount_cents=-3810,
            payee="CARREFOUR MARKET 1234",
            category=self.groceries,
            category_confirmed=False,
            category_source=Transaction.CategorySource.HISTORY,
        )

    def patch(self, data):
        response = self.client.patch(
            reverse("transaction-detail", args=[self.txn.id]), data, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.txn.refresh_from_db()
        return response

    def test_existing_and_new_rows_default_to_confirmed_manual(self):
        txn = Transaction.objects.create(
            account=self.account, date="2026-10-02", amount_cents=-100, payee="Shop"
        )
        self.assertTrue(txn.category_confirmed)
        self.assertEqual(txn.category_source, "manual")

    def test_fields_are_exposed_read_only(self):
        response = self.patch({"category_confirmed": True, "category_source": "manual"})
        self.assertEqual(response.data["category_confirmed"], False)
        self.assertEqual(response.data["category_source"], "history")
        self.assertFalse(self.txn.category_confirmed)

    def test_patching_a_different_category_confirms_it_as_manual(self):
        self.patch({"category": self.household.id})
        self.assertEqual(self.txn.category, self.household)
        self.assertTrue(self.txn.category_confirmed)
        self.assertEqual(self.txn.category_source, "manual")

    def test_patching_the_same_category_confirms_it_and_keeps_the_source(self):
        self.patch({"category": self.groceries.id})
        self.assertTrue(self.txn.category_confirmed)
        self.assertEqual(self.txn.category_source, "history")

    def test_notes_only_patch_leaves_a_guess_unconfirmed(self):
        self.patch({"notes": "weekly shop"})
        self.assertFalse(self.txn.category_confirmed)
        self.assertEqual(self.txn.category_source, "history")

    def test_clearing_the_category_leaves_confirmed_manual(self):
        self.patch({"category": None})
        self.assertIsNone(self.txn.category)
        self.assertTrue(self.txn.category_confirmed)
        self.assertEqual(self.txn.category_source, "manual")

    def test_saving_the_edit_form_confirms_the_category(self):
        # The edit form sends every field, the unchanged category included.
        self.patch(
            {
                "date": "2026-10-02",
                "amount_cents": -3810,
                "payee": "CARREFOUR MARKET 1234",
                "category": self.groceries.id,
                "notes": "changed only the notes",
            }
        )
        self.assertEqual(self.txn.category, self.groceries)
        self.assertTrue(self.txn.category_confirmed)

    def test_creating_with_a_category_is_confirmed_manual(self):
        response = self.client.post(
            reverse("transaction-list"),
            {
                "account": self.account.id,
                "date": "2026-10-03",
                "amount_cents": -500,
                "payee": "Bakery",
                "category": self.groceries.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["category_confirmed"])
        self.assertEqual(response.data["category_source"], "manual")

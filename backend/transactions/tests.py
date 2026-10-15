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

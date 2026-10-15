from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from transactions.models import Transaction

from .models import Category, CategoryLimit


class CategoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )

    def test_list_categories(self):
        Category.objects.create(name="Groceries")
        response = self.client.get(reverse("category-list"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual([c["name"] for c in response.json()], ["Groceries"])

    def test_create_category(self):
        response = self.client.post(reverse("category-list"), {"name": "Groceries"}, format="json")
        self.assertEqual(response.status_code, 201)

    def test_duplicate_category_name_is_rejected(self):
        Category.objects.create(name="Groceries")
        response = self.client.post(reverse("category-list"), {"name": "Groceries"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_rename_category(self):
        category = Category.objects.create(name="Groceries")
        response = self.client.patch(
            reverse("category-detail", args=[category.id]), {"name": "Food"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        category.refresh_from_db()
        self.assertEqual(category.name, "Food")

    def test_delete_blocked_while_transactions_assigned(self):
        category = Category.objects.create(name="Groceries")
        Transaction.objects.create(
            account=self.account, date="2026-01-01", amount_cents=-1000, payee="Store", category=category
        )
        response = self.client.delete(reverse("category-detail", args=[category.id]))
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Category.objects.filter(id=category.id).exists())

    def test_delete_succeeds_after_reassignment(self):
        category = Category.objects.create(name="Groceries")
        other = Category.objects.create(name="Other")
        transaction = Transaction.objects.create(
            account=self.account, date="2026-01-01", amount_cents=-1000, payee="Store", category=category
        )

        # Reassign via the existing transactions API (task 3.3), then delete.
        self.client.patch(
            reverse("transaction-detail", args=[transaction.id]),
            {"category": other.id},
            format="json",
        )
        response = self.client.delete(reverse("category-detail", args=[category.id]))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Category.objects.filter(id=category.id).exists())


class BudgetSummaryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )
        self.groceries = Category.objects.create(name="Groceries")

    def _set_limit(self, category, limit_cents, month=None):
        return self.client.put(
            reverse("category-set-limit", args=[category.id]),
            {"month": month, "limit_cents": limit_cents},
            format="json",
        )

    def test_default_limit_applies_when_no_override(self):
        self._set_limit(self.groceries, 40000)
        response = self.client.get(reverse("budget-summary"), {"month": "2026-03"})
        row = response.json()["categories"][0]
        self.assertEqual(row["limit_cents"], 40000)

    def test_month_override_takes_precedence_over_default(self):
        self._set_limit(self.groceries, 40000)
        self._set_limit(self.groceries, 60000, month="2026-12")

        december = self.client.get(reverse("budget-summary"), {"month": "2026-12"}).json()
        self.assertEqual(december["categories"][0]["limit_cents"], 60000)

        other_month = self.client.get(reverse("budget-summary"), {"month": "2026-11"}).json()
        self.assertEqual(other_month["categories"][0]["limit_cents"], 40000)

    def test_category_within_limit(self):
        self._set_limit(self.groceries, 40000)
        Transaction.objects.create(
            account=self.account, date="2026-01-10", amount_cents=-32000, payee="Store",
            category=self.groceries,
        )
        row = self.client.get(reverse("budget-summary"), {"month": "2026-01"}).json()["categories"][0]
        self.assertEqual(row["spent_cents"], 32000)
        self.assertEqual(row["remaining_cents"], 8000)
        self.assertFalse(row["over_limit"])

    def test_category_over_limit(self):
        self._set_limit(self.groceries, 40000)
        Transaction.objects.create(
            account=self.account, date="2026-01-10", amount_cents=-43000, payee="Store",
            category=self.groceries,
        )
        row = self.client.get(reverse("budget-summary"), {"month": "2026-01"}).json()["categories"][0]
        self.assertEqual(row["spent_cents"], 43000)
        self.assertEqual(row["remaining_cents"], -3000)
        self.assertTrue(row["over_limit"])

    def test_uncategorized_spend_reported_separately(self):
        Transaction.objects.create(
            account=self.account, date="2026-01-10", amount_cents=-5000, payee="Misc"
        )
        Transaction.objects.create(
            account=self.account, date="2026-01-11", amount_cents=-1000, payee="Store",
            category=self.groceries,
        )
        summary = self.client.get(reverse("budget-summary"), {"month": "2026-01"}).json()
        self.assertEqual(summary["uncategorized_spent_cents"], 5000)
        # and it must not be folded into any category's total
        self.assertEqual(summary["categories"][0]["spent_cents"], 1000)

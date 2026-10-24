from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from transactions.models import Transaction
from transactions.splits import SplitLine, save_split
from transactions.transfers import link_transfer

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


class SubcategoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )
        self.groceries = Category.objects.create(name="Groceries")

    def test_create_a_subcategory(self):
        response = self.client.post(
            reverse("category-list"),
            {"name": "Supermarket", "parent": self.groceries.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        supermarket = Category.objects.get(id=response.json()["id"])
        self.assertEqual(supermarket.parent_id, self.groceries.id)

    def test_reject_nesting_a_subcategory_under_a_subcategory(self):
        supermarket = Category.objects.create(name="Supermarket", parent=self.groceries)
        response = self.client.post(
            reverse("category-list"),
            {"name": "Deeper", "parent": supermarket.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Category.objects.filter(name="Deeper").exists())

    def test_reject_self_parenting(self):
        response = self.client.patch(
            reverse("category-detail", args=[self.groceries.id]),
            {"parent": self.groceries.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_two_top_level_categories_cannot_share_a_name(self):
        response = self.client.post(reverse("category-list"), {"name": "Groceries"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_two_subcategories_under_the_same_parent_cannot_share_a_name(self):
        Category.objects.create(name="Supermarket", parent=self.groceries)
        response = self.client.post(
            reverse("category-list"),
            {"name": "Supermarket", "parent": self.groceries.id},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_subcategories_under_different_parents_may_share_a_name(self):
        transport = Category.objects.create(name="Transport")
        Category.objects.create(name="Other", parent=self.groceries)
        response = self.client.post(
            reverse("category-list"),
            {"name": "Other", "parent": transport.id},
            format="json",
        )
        self.assertEqual(response.status_code, 201)

    def test_delete_blocked_while_subcategories_exist(self):
        Category.objects.create(name="Supermarket", parent=self.groceries)
        response = self.client.delete(reverse("category-detail", args=[self.groceries.id]))
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Category.objects.filter(id=self.groceries.id).exists())

    def test_delete_succeeds_once_subcategories_are_removed(self):
        supermarket = Category.objects.create(name="Supermarket", parent=self.groceries)
        self.client.delete(reverse("category-detail", args=[supermarket.id]))
        response = self.client.delete(reverse("category-detail", args=[self.groceries.id]))
        self.assertEqual(response.status_code, 204)

    def test_summary_keeps_parent_and_subcategory_figures_independent(self):
        supermarket = Category.objects.create(name="Supermarket", parent=self.groceries)
        Transaction.objects.create(
            account=self.account, date="2026-01-10", amount_cents=-32000, payee="Direct groceries",
            category=self.groceries,
        )
        Transaction.objects.create(
            account=self.account, date="2026-01-11", amount_cents=-9000, payee="Supermarket run",
            category=supermarket,
        )
        summary = self.client.get(reverse("budget-summary"), {"month": "2026-01"}).json()
        rows = {row["category_id"]: row for row in summary["categories"]}

        self.assertEqual(rows[self.groceries.id]["spent_cents"], 32000)
        self.assertEqual(rows[self.groceries.id]["parent_id"], None)
        self.assertEqual(rows[supermarket.id]["spent_cents"], 9000)
        self.assertEqual(rows[supermarket.id]["parent_id"], self.groceries.id)


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

    def test_unconfirmed_category_counts_toward_its_spend(self):
        # A guess counts toward its budget before anyone confirms it - see
        # openspec/specs/auto-categorization.
        Transaction.objects.create(
            account=self.account, date="2026-01-10", amount_cents=-4000, payee="Store",
            category=self.groceries, category_confirmed=False,
            category_source=Transaction.CategorySource.HISTORY,
        )
        Transaction.objects.create(
            account=self.account, date="2026-01-12", amount_cents=-1000, payee="Store",
            category=self.groceries,
        )
        summary = self.client.get(reverse("budget-summary"), {"month": "2026-01"}).json()
        self.assertEqual(summary["categories"][0]["spent_cents"], 5000)
        self.assertEqual(summary["uncategorized_spent_cents"], 0)

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

    def test_transfers_are_not_uncategorized_spend(self):
        savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        Transaction.objects.create(account=self.account, date="2026-01-10", amount_cents=-5000, payee="Misc")
        out = Transaction.objects.create(
            account=self.account, date="2026-01-12", amount_cents=-50000, payee="To savings"
        )
        link_transfer(out, savings)

        summary = self.client.get(reverse("budget-summary"), {"month": "2026-01"}).json()

        self.assertEqual(summary["uncategorized_spent_cents"], 5000)

    def test_split_parts_count_toward_their_categories(self):
        dinner = Transaction.objects.create(account=self.account, date="2026-01-10", amount_cents=-6000, payee="Shop")
        save_split(dinner, [SplitLine(-4000, category=self.groceries), SplitLine(-2000)])

        summary = self.client.get(reverse("budget-summary"), {"month": "2026-01"}).json()

        self.assertEqual(summary["categories"][0]["spent_cents"], 4000)
        self.assertEqual(summary["uncategorized_spent_cents"], 2000)


class TabGroupTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )
        self.tabs = Category.objects.create(name="Tabs")

    def patch(self, category, data):
        return self.client.patch(reverse("category-detail", args=[category.id]), data, format="json")

    def get(self, category):
        return self.client.get(reverse("category-detail", args=[category.id])).json()

    def test_make_a_tab_group(self):
        jan = Category.objects.create(name="Jan", parent=self.tabs)

        response = self.patch(self.tabs, {"is_tab_group": True})

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual((response.json()["is_tab_group"], response.json()["is_tab"]), (True, False))
        self.assertEqual((self.get(jan)["is_tab_group"], self.get(jan)["is_tab"]), (False, True))

    def test_a_tab_group_can_be_created_directly(self):
        response = self.client.post(
            reverse("category-list"), {"name": "Owed", "is_tab_group": True}, format="json"
        )

        self.assertEqual(response.status_code, 201, response.content)
        self.assertTrue(Category.objects.get(name="Owed").is_tab_group)

    def test_subcategories_cant_be_marked(self):
        groceries = Category.objects.create(name="Groceries")
        supermarket = Category.objects.create(name="Supermarket", parent=groceries)

        response = self.patch(supermarket, {"is_tab_group": True})

        self.assertEqual(response.status_code, 400)
        self.assertIn("is_tab_group", response.json())
        supermarket.refresh_from_db()
        self.assertFalse(supermarket.is_tab_group)

    def test_a_group_with_its_own_transactions_cant_become_a_tab_group(self):
        for day in (1, 2):
            Transaction.objects.create(
                account=self.account, date=f"2026-01-0{day}", amount_cents=-1000, payee="x", category=self.tabs
            )

        response = self.patch(self.tabs, {"is_tab_group": True})

        self.assertEqual(response.status_code, 400)
        self.assertIn("2 transaction(s)", response.json()["is_tab_group"][0])

    def test_rows_in_subcategories_dont_block_the_switch(self):
        jan = Category.objects.create(name="Jan", parent=self.tabs)
        Transaction.objects.create(account=self.account, date="2026-01-01", amount_cents=-1000, payee="x", category=jan)

        self.assertEqual(self.patch(self.tabs, {"is_tab_group": True}).status_code, 200)
        self.assertEqual(self.get(self.tabs)["transaction_count"], 0)
        self.assertEqual(self.get(jan)["transaction_count"], 1)

    def test_moving_a_category_out_of_a_tab_group(self):
        self.tabs.is_tab_group = True
        self.tabs.save()
        gifts = Category.objects.create(name="Gifts")
        jan = Category.objects.create(name="Jan", parent=self.tabs)
        self.assertTrue(self.get(jan)["is_tab"])

        self.patch(jan, {"parent": gifts.id})

        self.assertFalse(self.get(jan)["is_tab"])

    def test_list_carries_the_tab_fields(self):
        self.tabs.is_tab_group = True
        self.tabs.save()
        Category.objects.create(name="Jan", parent=self.tabs)

        rows = {c["name"]: c for c in self.client.get(reverse("category-list")).json()}

        self.assertEqual((rows["Tabs"]["is_tab_group"], rows["Jan"]["is_tab"]), (True, True))
        self.assertEqual(rows["Jan"]["transaction_count"], 0)


class TabsAreNotBudgetedTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )
        self.groceries = Category.objects.create(name="Groceries")
        self.tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        self.jan = Category.objects.create(name="Jan", parent=self.tabs)

    def test_tabs_are_not_in_the_summary(self):
        Transaction.objects.create(
            account=self.account, date="2026-10-03", amount_cents=-3000, payee="Pizzeria", category=self.jan
        )

        summary = self.client.get(reverse("budget-summary"), {"month": "2026-10"}).json()

        self.assertEqual([c["category_name"] for c in summary["categories"]], ["Groceries"])
        self.assertEqual(summary["uncategorized_spent_cents"], 0)

    def test_no_limit_on_a_tab(self):
        for category in (self.jan, self.tabs):
            with self.subTest(category=category.name):
                response = self.client.put(
                    reverse("category-set-limit", args=[category.id]), {"limit_cents": 1000}, format="json"
                )
                self.assertEqual(response.status_code, 400)
        self.assertFalse(CategoryLimit.objects.exists())


class BudgetSummaryQueryTests(TestCase):
    def test_query_count_does_not_grow_with_categories(self):
        client = APIClient()
        client.force_authenticate(user=get_user_model().objects.create_user(username="b", password="x"))
        account = Account.objects.create(name="Main", account_type="checking", starting_balance_cents=0)
        for i in range(6):
            category = Category.objects.create(name=f"C{i}")
            CategoryLimit.objects.create(category=category, month=None, limit_cents=1000)
            Transaction.objects.create(account=account, date="2026-01-05", amount_cents=-100, payee="x", category=category)

        with self.assertNumQueries(4):
            response = client.get(reverse("budget-summary"), {"month": "2026-01"})

        self.assertEqual([c["spent_cents"] for c in response.json()["categories"]], [100] * 6)

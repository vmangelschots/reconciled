from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from transactions.models import Transaction
from transactions.splits import SplitLine, save_split
from transactions.transfers import link_transfer

from .models import BudgetSettings, Category, CategoryLimit, YearlyBudget


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
        BudgetSettings.objects.create(pk=1)
        for i in range(6):
            category = Category.objects.create(name=f"C{i}")
            CategoryLimit.objects.create(category=category, month=None, limit_cents=1000)
            Transaction.objects.create(account=account, date="2026-01-05", amount_cents=-100, payee="x", category=category)
            yearly = Category.objects.create(name=f"Y{i}", budget_kind="yearly")
            YearlyBudget.objects.create(category=yearly, from_year=2026, amount_cents=1000)
            Transaction.objects.create(account=account, date="2026-01-05", amount_cents=-100, payee="x", category=yearly)

        # Four for the monthly rows and uncategorized, one for the month's
        # yearly spending, four for the yearly rows.
        with self.assertNumQueries(9):
            response = client.get(reverse("budget-summary"), {"month": "2026-01"})

        self.assertEqual([c["spent_cents"] for c in response.json()["categories"]], [100] * 6)
        self.assertEqual([c["spent_cents"] for c in response.json()["yearly"]["categories"]], [100] * 6)


@patch("budgets.utils.today", lambda: date(2026, 10, 24))
class BudgetKindTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=get_user_model().objects.create_user(username="b", password="x"))
        self.clothing = Category.objects.create(name="Clothing")

    def _set_budget(self, category, **body):
        return self.client.put(reverse("category-set-budget", args=[category.id]), body, format="json")

    def _category(self, category):
        return next(c for c in self.client.get(reverse("category-list")).json() if c["id"] == category.id)

    def test_new_categories_are_monthly(self):
        response = self.client.post(reverse("category-list"), {"name": "Groceries"}, format="json")
        self.assertEqual(response.json()["budget_kind"], "monthly")

    def test_make_a_category_yearly(self):
        response = self._set_budget(self.clothing, kind="yearly", amount_cents=120000)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["budget_kind"], "yearly")
        self.assertEqual(response.json()["yearly"], {"amount_cents": 120000, "due": None})
        self.assertEqual(YearlyBudget.objects.get().from_year, 2026)

    def test_no_kind_for_a_tab(self):
        tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        jan = Category.objects.create(name="Jan", parent=tabs)
        self.assertEqual(self._set_budget(jan, kind="yearly", amount_cents=1000).status_code, 400)
        self.assertEqual(self._set_budget(tabs, kind="yearly", amount_cents=1000).status_code, 400)

    def test_monthly_to_yearly_drops_monthly_limits(self):
        CategoryLimit.objects.create(category=self.clothing, month=None, limit_cents=10000)
        CategoryLimit.objects.create(category=self.clothing, month=date(2026, 12, 1), limit_cents=25000)
        self.assertEqual(self._category(self.clothing)["monthly_limits"], {"default_cents": 10000, "override_count": 1})
        self._set_budget(self.clothing, kind="yearly", amount_cents=120000)
        self.assertFalse(CategoryLimit.objects.exists())

    def test_yearly_to_monthly_drops_yearly_amounts(self):
        YearlyBudget.objects.create(category=self.clothing, from_year=2025, amount_cents=100000)
        YearlyBudget.objects.create(category=self.clothing, from_year=2026, amount_cents=120000)
        self.clothing.budget_kind = "yearly"
        self.clothing.save()
        response = self._set_budget(self.clothing, kind="monthly", amount_cents=10000)
        self.assertEqual(response.json()["budget_kind"], "monthly")
        self.assertFalse(YearlyBudget.objects.exists())
        self.assertEqual(CategoryLimit.objects.get().limit_cents, 10000)

    def test_nothing_to_drop(self):
        self.assertEqual(self._category(self.clothing)["monthly_limits"], {"default_cents": None, "override_count": 0})
        self.assertEqual(self._set_budget(self.clothing, kind="yearly", amount_cents=50000).status_code, 200)

    def test_yearly_to_on_a_date_keeps_the_budget(self):
        YearlyBudget.objects.create(category=self.clothing, from_year=2025, amount_cents=40000)
        self.clothing.budget_kind = "yearly"
        self.clothing.save()
        response = self._set_budget(self.clothing, kind="target", amount_cents=40000, due="11-01")
        self.assertEqual(response.json()["yearly"], {"amount_cents": 40000, "due": "11-01"})
        self.assertEqual(
            response.json()["yearly_history"],
            [
                {"from_year": 2026, "amount_cents": 40000, "due": "11-01"},
                {"from_year": 2025, "amount_cents": 40000, "due": None},
            ],
        )

    def test_a_due_date_is_required(self):
        self.assertEqual(self._set_budget(self.clothing, kind="target", amount_cents=40000).status_code, 400)

    def test_a_yearly_amount_is_required(self):
        self.assertEqual(self._set_budget(self.clothing, kind="yearly").status_code, 400)

    def test_no_monthly_limit_on_a_yearly_category(self):
        self._set_budget(self.clothing, kind="yearly", amount_cents=120000)
        response = self.client.put(
            reverse("category-set-limit", args=[self.clothing.id]), {"month": None, "limit_cents": 100}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_set_a_target(self):
        response = self._set_budget(self.clothing, kind="target", amount_cents=40000, due="11-01")
        self.assertEqual(response.json()["yearly"], {"amount_cents": 40000, "due": "11-01"})

    def test_reject_29_february(self):
        self.assertEqual(self._set_budget(self.clothing, kind="target", amount_cents=40000, due="02-29").status_code, 400)

    def test_a_change_mid_year_covers_the_whole_year(self):
        self._set_budget(self.clothing, kind="yearly", amount_cents=120000)
        self._set_budget(self.clothing, kind="yearly", amount_cents=150000)
        self.assertEqual(list(YearlyBudget.objects.values_list("from_year", "amount_cents")), [(2026, 150000)])

    def test_two_years_of_history(self):
        self._set_budget(self.clothing, kind="yearly", amount_cents=120000)
        with patch("budgets.utils.today", lambda: date(2027, 1, 5)):
            self._set_budget(self.clothing, kind="yearly", amount_cents=150000)
            self.assertEqual(self._category(self.clothing)["yearly"]["amount_cents"], 150000)
        self.assertEqual(
            [(h["from_year"], h["amount_cents"]) for h in self._category(self.clothing)["yearly_history"]],
            [(2027, 150000), (2026, 120000)],
        )

    def test_several_changes_in_one_year(self):
        for amount in (120000, 130000, 150000):
            self._set_budget(self.clothing, kind="yearly", amount_cents=amount)
        self.assertEqual(self._category(self.clothing)["yearly_history"], [{"from_year": 2026, "amount_cents": 150000, "due": None}])


@patch("budgets.utils.today", lambda: date(2026, 10, 24))
class YearlySummaryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=get_user_model().objects.create_user(username="b", password="x"))
        self.account = Account.objects.create(name="Main", account_type="checking", starting_balance_cents=0)
        self.clothing = Category.objects.create(name="Clothing", budget_kind="yearly")
        YearlyBudget.objects.create(category=self.clothing, from_year=2026, amount_cents=120000)
        Transaction.objects.create(
            account=self.account, date="2026-10-10", amount_cents=-18000, payee="x", category=self.clothing
        )

    def _summary(self, month="2026-10"):
        return self.client.get(reverse("budget-summary"), {"month": month}).json()

    def _set_start(self, start_month):
        return self.client.put(reverse("budget-settings"), {"start_month": start_month}, format="json")

    def test_viewing_october(self):
        self._set_start("2026-10")
        yearly = self._summary()["yearly"]
        self.assertEqual((yearly["year"], yearly["through"], yearly["start_month"]), (2026, "2026-10-24", "2026-10-01"))
        row = yearly["categories"][0]
        self.assertEqual((row["budget_cents"], row["spent_cents"], row["remaining_cents"]), (30000, 18000, 12000))

    def test_yearly_spending_line(self):
        tax = Category.objects.create(name="Property tax", budget_kind="target")
        YearlyBudget.objects.create(category=tax, from_year=2026, amount_cents=40000, due_month=11, due_day=1)
        Transaction.objects.create(account=self.account, date="2026-10-20", amount_cents=-40000, payee="x", category=tax)
        summary = self._summary()
        self.assertEqual(summary["yearly_spent_cents"], 58000)
        self.assertEqual(summary["categories"], [])
        self.assertEqual(summary["uncategorized_spent_cents"], 0)

    def test_set_the_start_month(self):
        self.assertEqual(self._summary()["yearly"]["categories"][0]["budget_cents"], 120000)
        response = self._set_start("2026-10")
        self.assertEqual(response.json(), {"start_month": "2026-10"})
        self.assertEqual(self.client.get(reverse("budget-settings")).json(), {"start_month": "2026-10"})
        self.assertEqual(self._summary()["yearly"]["categories"][0]["budget_cents"], 30000)

    def test_clear_the_start_month(self):
        self._set_start("2026-10")
        self.assertEqual(self._set_start(None).json(), {"start_month": None})
        self.assertEqual(self._summary()["yearly"]["categories"][0]["budget_cents"], 120000)

    def test_viewing_a_month_before_the_start(self):
        self._set_start("2026-10")
        yearly = self._summary("2026-09")["yearly"]
        self.assertEqual((yearly["starts"], yearly["categories"]), ("2026-10-01", []))

    def test_reject_a_malformed_start_month(self):
        self.assertEqual(self._set_start("October").status_code, 400)

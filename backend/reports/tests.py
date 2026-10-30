from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category
from transactions.models import Transaction
from transactions.splits import SplitLine, save_split
from transactions.transfers import link_transfer


class ReportTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="reporter", password="x")
        self.client.force_authenticate(user=user)
        self.checking = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)
        self.savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        self.archived = Account.objects.create(
            name="Old", account_type="checking", starting_balance_cents=0, archived=True
        )

    def txn(self, amount_cents, on, account=None, category=None):
        return Transaction.objects.create(
            account=account or self.checking, date=on, amount_cents=amount_cents, payee="x", category=category
        )

    def in_out(self, month):
        response = self.client.get(reverse("report-spending"), {"start": month, "end": month})
        return response.json()["in_out"]


class TabRowsTests(ReportTestCase):
    def setUp(self):
        super().setUp()
        self.restaurants = Category.objects.create(name="Restaurants")
        tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        self.jan = Category.objects.create(name="Jan", parent=tabs)

    def test_half_a_dinner_to_a_tab(self):
        dinner = self.txn(-6000, date(2026, 3, 3))
        save_split(dinner, [SplitLine(-3000, category=self.restaurants), SplitLine(-3000, category=self.jan)])

        months = self.in_out("2026-03")
        spending = self.client.get(reverse("report-category-spending"), {"month": "2026-03"}).json()

        self.assertEqual(months[-1], {"month": "2026-03", "in_cents": 0, "out_cents": 3000})
        self.assertEqual({c["name"]: c["spent_cents"] for c in spending["categories"]}, {"Restaurants": 3000})
        self.assertEqual(spending["uncategorized_cents"], 0)

    def test_a_repayment_is_not_income(self):
        self.txn(3000, date(2026, 3, 12), category=self.jan)
        self.txn(-100, date(2026, 3, 13))

        months = self.in_out("2026-03")

        self.assertEqual(months[-1], {"month": "2026-03", "in_cents": 0, "out_cents": 100})

    def test_uncategorized_rows_still_count(self):
        self.txn(-4000, date(2026, 3, 3))

        months = self.in_out("2026-03")

        self.assertEqual(months[-1]["out_cents"], 4000)


class CategorySpendingTests(ReportTestCase):
    def setUp(self):
        super().setUp()
        self.groceries = Category.objects.create(name="Groceries")
        self.supermarket = Category.objects.create(name="Supermarket", parent=self.groceries)
        self.market = Category.objects.create(name="Market", parent=self.groceries)
        self.clothing = Category.objects.create(name="Clothing")
        self.salary = Category.objects.create(name="Salary")

    def get(self, month="2026-03"):
        return self.client.get(reverse("report-category-spending"), {"month": month})

    def test_rolls_subcategories_into_their_parent(self):
        self.txn(-5000, date(2026, 3, 2), category=self.groceries)
        self.txn(-20000, date(2026, 3, 3), category=self.supermarket)

        [groceries] = self.get().json()["categories"]

        self.assertEqual(groceries["name"], "Groceries")
        self.assertEqual(groceries["spent_cents"], 25000)
        self.assertEqual(groceries["direct_cents"], 5000)
        # Market has no spending, so it isn't listed.
        self.assertEqual(
            groceries["subcategories"], [{"category_id": self.supermarket.id, "name": "Supermarket", "spent_cents": 20000}]
        )

    def test_refunds_reduce_spending_and_net_income_is_omitted(self):
        self.txn(-8000, date(2026, 3, 4), category=self.clothing)
        self.txn(3000, date(2026, 3, 9), category=self.clothing)
        self.txn(250000, date(2026, 3, 25), category=self.salary)

        categories = self.get().json()["categories"]

        self.assertEqual([(c["name"], c["spent_cents"]) for c in categories], [("Clothing", 5000)])

    def test_uncategorized_counts_outflows_only(self):
        self.txn(-4000, date(2026, 3, 5))
        self.txn(200000, date(2026, 3, 25))

        self.assertEqual(self.get().json()["uncategorized_cents"], 4000)

    def test_uncategorized_ignores_transfers(self):
        self.txn(-4000, date(2026, 3, 5))
        link_transfer(self.txn(-50000, date(2026, 3, 6)), self.savings)

        self.assertEqual(self.get().json()["uncategorized_cents"], 4000)

    def test_split_parts_count_toward_their_categories(self):
        household = Category.objects.create(name="Household")
        shop = self.txn(-6000, date(2026, 3, 5))
        save_split(shop, [SplitLine(-4000, category=self.groceries), SplitLine(-2000, category=household)])

        body = self.get().json()

        self.assertEqual(
            {c["name"]: c["spent_cents"] for c in body["categories"]}, {"Groceries": 4000, "Household": 2000}
        )
        self.assertEqual(body["uncategorized_cents"], 0)

    def test_sorted_largest_first(self):
        self.txn(-100, date(2026, 3, 1), category=self.clothing)
        self.txn(-900, date(2026, 3, 1), category=self.market)

        names = [c["name"] for c in self.get().json()["categories"]]

        self.assertEqual(names, ["Groceries", "Clothing"])

    def test_excludes_archived_accounts_and_other_months(self):
        self.txn(-700, date(2026, 3, 5), account=self.archived, category=self.clothing)
        self.txn(-700, date(2026, 3, 5), account=self.archived)
        self.txn(-700, date(2026, 2, 28), category=self.clothing)

        body = self.get().json()

        self.assertEqual(body["categories"], [])
        self.assertEqual(body["uncategorized_cents"], 0)

    def test_malformed_month_is_rejected(self):
        self.assertEqual(self.client.get(reverse("report-category-spending")).status_code, 400)
        self.assertEqual(self.get("2026-3x").status_code, 400)

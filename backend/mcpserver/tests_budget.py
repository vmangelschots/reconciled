"""get_budget against the Budgets page's API."""

from datetime import date
from unittest import mock

from accounts.models import Account
from budgets.models import Bill, Category, CategoryLimit
from mcpserver import format as fmt
from transactions.models import Transaction

from .testing import ToolTestCase

TODAY = date(2026, 11, 19)


@mock.patch("budgets.utils.today", return_value=TODAY)
class BudgetToolTests(ToolTestCase):
    def setUp(self):
        super().setUp()
        account = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        self.market = Category.objects.create(name="Market", parent=self.groceries)
        CategoryLimit.objects.create(category=self.groceries, limit_cents=40000)
        self.streaming = Category.objects.create(name="Streaming", budget_kind=Category.BudgetKind.BILLS)
        Bill.objects.create(category=self.streaming, name="Netflix", day=5, amount_cents=1799, from_month=date(2026, 1, 1))
        make = Transaction.objects.create
        make(account=account, date=date(2026, 11, 3), amount_cents=-12000, payee="AH", category=self.groceries)
        make(account=account, date=date(2026, 11, 8), amount_cents=-3000, payee="Markt", category=self.market)
        make(account=account, date=date(2026, 11, 5), amount_cents=-1799, payee="Netflix", category=self.streaming)

    def test_matches_the_budgets_page(self, _today):
        tool = self.tool("get_budget")
        page = self.api.get("/api/budgets/summary/", {"month": "2026-11"}).json()
        self.assertEqual(tool["month"], "2026-11")
        by_id = {r["category_id"]: r for r in tool["categories"]}
        for row in page["categories"]:
            with self.subTest(category=row["category_name"]):
                mine = by_id[row["category_id"]]
                self.assertEqual(mine["limit"], fmt.money(row["limit_cents"]))
                self.assertEqual(mine["spent"], fmt.money(row["spent_cents"]))
                self.assertEqual(mine["remaining"], fmt.money(row["remaining_cents"]))
                self.assertEqual(mine["over_limit"], row["over_limit"])
        self.assertEqual(tool["totals"]["limit"], fmt.money(page["totals"]["limit_cents"]))
        self.assertEqual(tool["totals"]["spent"], fmt.money(page["totals"]["spent_cents"]))
        self.assertEqual(tool["pace"], page["pace"])
        self.assertEqual(tool["totals"]["marker"], page["totals"]["marker"])

    def test_a_parent_covers_its_subcategories(self, _today):
        rows = {r["category_name"]: r for r in self.tool("get_budget")["categories"]}
        self.assertEqual(rows["Groceries"]["spent"], "150.00 EUR")
        self.assertTrue(rows["Groceries"]["covers_subcategories"])
        self.assertTrue(rows["Market"]["covered_by_parent"])
        # Groceries 150 + Netflix 17.99, the market spending not twice.
        self.assertEqual(self.tool("get_budget")["totals"]["spent"], "167.99 EUR")

    def test_bills(self, _today):
        rows = {r["category_name"]: r for r in self.tool("get_budget")["categories"]}
        streaming = rows["Streaming"]
        self.assertEqual(streaming["kind"], "bills")
        self.assertEqual(streaming["bills"][0]["name"], "Netflix")
        self.assertEqual(streaming["bills"][0]["paid_on"], "2026-11-05")
        self.assertEqual(streaming["unpaid"], "0.00 EUR")

    def test_another_month(self, _today):
        body = self.tool("get_budget", month="2026-10")
        self.assertEqual(body["month"], "2026-10")
        self.assertIsNone(body["pace"])

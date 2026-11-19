"""The overview, report, forecast, plan, net worth, loan and tab tools, each
against the API of the page it mirrors. See openspec/specs/mcp-server."""

from datetime import date
from unittest import mock

from accounts.models import Account
from budgets.models import Bill, Category, CategoryLimit, YearlyBudget, YearPlan
from forecasting.models import ExpectedItem
from transactions.models import Transaction

from . import format as fmt
from .testing import ToolTestCase

TODAY = date(2026, 11, 19)


class ReportToolCase(ToolTestCase):
    def setUp(self):
        super().setUp()
        patcher = mock.patch("django.utils.timezone.localdate", return_value=TODAY)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.crelan = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=100000)
        self.savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=500000)
        self.groceries = Category.objects.create(name="Groceries")
        self.income = Category.objects.create(name="Income")
        self.holiday = Category.objects.create(name="Holiday", budget_kind=Category.BudgetKind.YEARLY)
        self.streaming = Category.objects.create(name="Streaming", budget_kind=Category.BudgetKind.BILLS)
        CategoryLimit.objects.create(category=self.groceries, limit_cents=40000)
        YearlyBudget.objects.create(category=self.holiday, from_year=2026, amount_cents=200000)
        Bill.objects.create(category=self.streaming, name="Netflix", day=5, amount_cents=1799, from_month=date(2026, 1, 1))
        tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        self.jan = Category.objects.create(name="Jan", parent=tabs)
        ExpectedItem.objects.create(name="Salary", direction="in", amount_cents=240000, day=25, account=self.crelan)
        for month in range(6, 12):
            self.txn(240000, 25 if month < 11 else 1, month, self.income, payee="Employer")
            self.txn(-12000, 3, month, self.groceries, payee="AH")
            self.txn(-1799, 5, month, self.streaming, payee="Netflix")
        self.txn(-50000, 10, 8, self.holiday, payee="Airline")
        self.txn(-3000, 3, 11, self.jan, payee="Lent to Jan")

    def txn(self, cents, day, month, category=None, account=None, payee="line"):
        return Transaction.objects.create(
            account=account or self.crelan, date=date(2026, month, day), amount_cents=cents, payee=payee, category=category
        )

    def page(self, path, **params):
        response = self.api.get(path, params)
        self.assertEqual(response.status_code, 200, response.content)
        return fmt.present(response.json())


class OverviewToolTests(ReportToolCase):
    def test_matches_the_overview_page(self):
        self.assertEqual(self.tool("get_overview"), self.page("/api/reports/overview/", month="2026-11"))
        self.assertEqual(self.tool("get_overview", month="2026-09"), self.page("/api/reports/overview/", month="2026-09"))

    def test_reads_as_money(self):
        body = self.tool("get_overview")
        self.assertEqual(body["balance"], fmt.money(self.crelan.current_balance_cents + self.savings.current_balance_cents))
        self.assertTrue(body["in_out"]["out"].endswith(" EUR"))


class SpendingToolTests(ReportToolCase):
    def test_matches_the_reports_page(self):
        tool = self.tool("get_spending_report", start="2026-01", end="2026-10")
        self.assertEqual(tool, self.page("/api/reports/spending/", start="2026-01", end="2026-10"))

    def test_end_defaults_to_this_month(self):
        tool = self.tool("get_spending_report", start="2026-06")
        self.assertEqual(tool, self.page("/api/reports/spending/", start="2026-06", end="2026-11"))

    def test_range_errors(self):
        self.assertIn("at most 24 months", self.tool_error("get_spending_report", start="2024-01", end="2026-11"))
        self.assertIn("not past this month", self.tool_error("get_spending_report", start="2026-10", end="2026-12"))
        self.assertIn("start is required", self.tool_error("get_spending_report"))


class ForecastToolTests(ReportToolCase):
    def test_matches_the_forecast_page(self):
        page = self.page("/api/forecast/", horizon_days=90)
        page.pop("accounts")
        self.assertEqual(self.tool("get_forecast"), page)

    def test_coming_up(self):
        body = self.tool("get_forecast", days=40)
        self.assertEqual(len(body["points"]), 41)
        sources = {(i["name"], i["source"]) for i in body["items"]}
        self.assertIn(("Netflix", "bill"), sources)
        self.assertIn(("Groceries", "budget"), sources)
        self.assertTrue(all(i["amount"].endswith(" EUR") for i in body["items"]))


class YearPlanToolTests(ReportToolCase):
    def test_matches_the_year_view_without_drafts(self):
        YearPlan.objects.create(year=2026, name="Draft with a secret name")
        tool = self.tool("get_year_plan", year=2026)
        page = self.page("/api/budgets/plans/current/2026/")
        self.assertEqual(tool["totals"], page["totals"])
        self.assertEqual(
            [(r["category_name"], r["plan"], r["actual"], r["heading"]) for r in tool["rows"]],
            [(r["category_name"], r["plan"], r["actual"], r["heading"]) for r in page["rows"]],
        )
        holiday = next(r for r in tool["rows"] if r["category_name"] == "Holiday")
        self.assertEqual((holiday["plan"], holiday["actual"]), ("2000.00 EUR", "500.00 EUR"))
        self.assertNotIn("secret name", str(tool))
        self.assertEqual(self.tool("get_year_plan")["year"], 2026)


class NetWorthToolTests(ReportToolCase):
    def test_last_twelve_months_or_fewer(self):
        page = self.page("/api/reports/net-worth/")["months"]
        months = self.tool("get_net_worth_history")["months"]
        # History starts in June: six months, though twelve were asked for.
        self.assertEqual([m["month"] for m in months], ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"])
        self.assertEqual(months, page[-12:])
        self.assertEqual([m["month"] for m in self.tool("get_net_worth_history", months=2)["months"]], ["2026-10", "2026-11"])


class LoanToolTests(ReportToolCase):
    def test_a_mortgage(self):
        mortgage = Account.objects.create(name="Mortgage", account_type="loan", starting_balance_cents=0)
        terms = {
            "principal_cents": 20000000,
            "annual_rate": "3.00",
            "term_months": 300,
            "first_payment_date": "2024-12-02",
            "paid_from": self.crelan.id,
            "payment_category": self.groceries.id,
        }
        self.assertIn(self.api.put(f"/api/accounts/{mortgage.id}/loan/", terms, format="json").status_code, (200, 201))
        schedule = self.api.get(f"/api/accounts/{mortgage.id}/loan/").json()
        (loan,) = self.tool("list_loans")["loans"]
        self.assertEqual(loan["account"], "Mortgage")
        self.assertEqual(loan["principal"], "200000.00 EUR")
        self.assertEqual(loan["installment"], fmt.money(schedule["payment_cents"]))
        self.assertEqual(loan["still_owed"], fmt.money(-schedule["current_balance_cents"]))
        self.assertEqual(loan["next_installment"], "2026-12-02")
        self.assertEqual(loan["last_installment"], schedule["end_date"])


class TabToolTests(ReportToolCase):
    def test_worded_balances(self):
        (tab,) = self.tool("list_tabs")["tabs"]
        page = self.api.get("/api/tabs/").json()[0]
        self.assertEqual(tab["balance"], "Jan owes you 30.00 EUR")
        self.assertEqual(tab["owed_to_you"], fmt.money(page["balance_cents"]))
        self.assertEqual(tab["open_since"], "2026-11-03")
        self.txn(5000, 10, 11, self.jan, payee="Jan paid back")
        self.assertEqual(self.tool("list_tabs")["tabs"][0]["balance"], "You owe Jan 20.00 EUR")

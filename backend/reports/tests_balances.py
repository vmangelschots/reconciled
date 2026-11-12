from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from households.testing import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Bill, Category
from forecasting.models import ExpectedItem
from transactions.adjustments import set_value
from transactions.models import Transaction
from transactions.splits import SplitLine, save_split

TODAY = date(2026, 10, 24)


class BalanceCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="u", password="x"))
        self.checking = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)

    def txn(self, amount_cents, day, account=None):
        return Transaction.objects.create(
            account=account or self.checking, date=day, amount_cents=amount_cents, payee="bank line"
        )

    def everyday(self, month="2026-10"):
        response = self.client.get(reverse("report-everyday-balance"), {"month": month})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def bills(self):
        """Two bills: 200.00 on the 29th and 50.00 on the 3rd, from October."""
        streaming = Category.objects.create(name="Bills", budget_kind="bills")
        for name, day, cents in (("Rent", 29, 20000), ("Phone", 3, 5000)):
            Bill.objects.create(category=streaming, name=name, day=day, amount_cents=cents, from_month=date(2026, 10, 1))

    def net_worth(self):
        response = self.client.get(reverse("report-net-worth"))
        self.assertEqual(response.status_code, 200, response.content)
        return {m["month"]: m for m in response.json()["months"]}


@patch("reports.views._today", lambda: TODAY)
class EverydayBalanceTests(BalanceCase):
    """The everyday scenarios in openspec/specs/balance-history."""

    def balances(self, **kwargs):
        return {p["date"]: p["balance_cents"] for p in self.everyday(**kwargs)["points"]}

    def test_a_split_counts_once(self):
        txn = self.txn(-6000, date(2026, 10, 10))
        save_split(txn, [SplitLine(amount_cents=-4000), SplitLine(amount_cents=-2000)])
        self.assertEqual(self.balances()["2026-10-10"], -6000)

    def test_current_month_ends_today(self):
        self.txn(1000, date(2026, 1, 1))
        points = self.everyday()["points"]
        self.assertEqual(len(points), 90)
        self.assertEqual(points[-1]["date"], "2026-10-24")
        self.assertEqual(points[0]["date"], "2026-07-27")
        self.assertEqual(points[0]["balance_cents"], 1000)

    def test_past_month_ends_on_its_last_day(self):
        self.txn(1000, date(2026, 1, 1))
        self.txn(500, date(2026, 10, 1))
        body = self.everyday(month="2026-09")
        self.assertEqual(body["points"][-1], {"date": "2026-09-30", "balance_cents": 1000})
        self.assertEqual(body["end"], "2026-09-30")

    def test_short_history_is_not_padded(self):
        self.txn(1000, TODAY - timedelta(days=20))
        self.assertEqual(len(self.everyday()["points"]), 21)

    def test_no_history(self):
        self.assertEqual(self.everyday()["points"], [])

    def test_only_the_everyday_tier_counts(self):
        savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=500000)
        self.txn(1000, date(2026, 10, 1))
        self.txn(1000, date(2026, 10, 1), account=savings)
        self.assertEqual(self.balances()["2026-10-01"], 1000)

    def test_one_tier_that_isnt_everyday(self):
        self.checking.archived = True
        self.checking.save()
        savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=500000)
        self.txn(1000, date(2026, 10, 1), account=savings)
        body = self.everyday()
        self.assertEqual(body["tier"], "savings")
        self.assertEqual(body["points"][-1]["balance_cents"], 501000)

    def test_two_accounts_add_up_in_the_projection(self):
        Account.objects.create(name="Crelan", account_type="cash", starting_balance_cents=10000)
        self.txn(50000, date(2026, 10, 1))
        self.bills()
        body = self.everyday()
        projected = {p["date"]: p["balance_cents"] for p in body["projection"]}
        self.assertEqual(body["projection"][0], {"date": "2026-10-24", "balance_cents": 60000})
        self.assertEqual(projected["2026-10-29"], 40000)
        self.assertEqual(projected["2026-11-03"], 35000)
        self.assertEqual(len(body["projection"]), 31)
        self.assertEqual(body["lowest"], {"date": "2026-11-03", "balance_cents": 35000})

    def test_the_same_as_the_forecast_over_30_days(self):
        self.bills()
        with patch("budgets.utils.today", lambda: TODAY):
            forecast = self.client.get(reverse("forecast"), {"horizon_days": 30}).json()
        self.assertEqual(self.everyday()["projection"], forecast["points"])

    def test_past_month_has_no_projection(self):
        self.bills()
        self.assertIsNone(self.everyday(month="2026-09")["projection"])

    def test_nothing_expected_has_no_projection(self):
        body = self.everyday()
        self.assertIsNone(body["projection"])
        self.assertIsNone(body["lowest"])

    def test_bills_but_no_salary(self):
        self.bills()
        self.assertFalse(self.everyday()["has_income"])
        ExpectedItem.objects.create(
            name="Salary", direction="in", amount_cents=450000, day=25, category=Category.objects.create(name="Salary")
        )
        self.assertTrue(self.everyday()["has_income"])

    def test_a_malformed_month_is_rejected(self):
        response = self.client.get(reverse("report-everyday-balance"), {"month": "october"})
        self.assertEqual(response.status_code, 400)


@patch("reports.views._today", lambda: TODAY)
class NetWorthTests(BalanceCase):
    """The net worth scenarios in openspec/specs/balance-history."""

    def test_a_year_ahead(self):
        self.txn(410000, date(2026, 9, 1))
        self.bills()
        ExpectedItem.objects.create(
            name="Salary", direction="in", amount_cents=450000, day=25, category=Category.objects.create(name="Salary")
        )
        body = self.client.get(reverse("report-net-worth")).json()
        projection = body["projection"]
        self.assertEqual((projection[0]["month"], projection[-1]["month"], len(projection)), ("2026-11", "2027-10", 12))
        with patch("budgets.utils.today", lambda: TODAY):
            forecast = self.client.get(reverse("forecast-net-worth"), {"years": 1}).json()
        self.assertEqual(projection, forecast["months"][1:])
        self.assertEqual(forecast["months"][0]["total_cents"], body["months"][-1]["total_cents"])

    def test_nothing_forecast_has_no_projection(self):
        self.assertIsNone(self.client.get(reverse("report-net-worth")).json()["projection"])

    def test_tiers_add_up(self):
        Account.objects.create(name="House", account_type="property", starting_balance_cents=53000000)
        Account.objects.create(name="Loan", account_type="loan", starting_balance_cents=-17980000)
        self.txn(410000, date(2026, 9, 1))
        october = self.net_worth()["2026-10"]
        self.assertEqual(october["total_cents"], 35430000)
        self.assertEqual(
            october["tiers"],
            [
                {"tier": "everyday", "balance_cents": 410000},
                {"tier": "property", "balance_cents": 53000000},
                {"tier": "loans", "balance_cents": -17980000},
            ],
        )

    def test_a_value_adjustment_moves_the_balance(self):
        house = Account.objects.create(name="House", account_type="property", starting_balance_cents=0)
        self.txn(100, date(2026, 8, 1))
        set_value(house, date(2026, 10, 10), 29500000)
        months = self.net_worth()
        self.assertEqual(months["2026-09"]["total_cents"], 100)
        self.assertEqual(months["2026-10"]["total_cents"], 29500100)

    def test_a_purchase_with_a_loan_is_neutral(self):
        house = Account.objects.create(name="House", account_type="property", starting_balance_cents=0)
        loan = Account.objects.create(name="Loan", account_type="loan", starting_balance_cents=0)
        self.txn(100, date(2026, 9, 1))
        set_value(house, date(2026, 10, 10), 30000000)
        set_value(loan, date(2026, 10, 10), -30000000)
        months = self.net_worth()
        self.assertEqual(months["2026-10"]["total_cents"], months["2026-09"]["total_cents"])

    def test_a_closed_savings_account_stays_in_history(self):
        old = Account.objects.create(
            name="Old savings", account_type="savings", starting_balance_cents=500000, archived=True
        )
        self.txn(-500000, date(2026, 6, 15), account=old)
        self.txn(100, date(2026, 5, 1))
        months = self.net_worth()
        self.assertEqual(months["2026-05"]["total_cents"], 500100)
        self.assertEqual(months["2026-06"]["total_cents"], 100)

    def test_the_current_month_reports_today(self):
        self.txn(100, date(2026, 9, 1))
        self.txn(200, TODAY)
        self.txn(400, TODAY + timedelta(days=3))
        self.assertEqual(self.net_worth()["2026-10"]["total_cents"], 300)

    def test_months_run_from_the_first_row(self):
        self.txn(100, date(2026, 8, 20))
        self.assertEqual(list(self.net_worth()), ["2026-08", "2026-09", "2026-10"])

    def test_no_rows_no_months(self):
        self.assertEqual(self.net_worth(), {})

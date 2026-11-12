from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account, Loan
from budgets.models import Bill, Category, CategoryLimit, YearlyBudget
from households.testing import TestCase
from transactions.models import Transaction
from transactions.transfers import link_transfer

from .forecast import everyday_forecast
from .models import ExpectedItem

TODAY = date(2026, 11, 12)


class ForecastCase(TestCase):
    """The forecasting spec's scenarios, with today on 12 November 2026."""

    def setUp(self):
        self.crelan = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=150000)

    def forecast(self, today=TODAY, days=90):
        return everyday_forecast(today, days)

    def items(self, forecast, source=None):
        return [(i["date"], i["name"], i["amount_cents"]) for i in forecast["items"] if source in (None, i["source"])]

    def balances(self, forecast):
        return {p["date"]: p["balance_cents"] for p in forecast["points"]}

    def pay(self, day, cents, category=None, **fields):
        return Transaction.objects.create(
            account=fields.pop("account", self.crelan), date=day, amount_cents=cents, payee="x", category=category, **fields
        )

    def streaming(self, *bills, kind="bills"):
        category = Category.objects.create(name="Streaming", budget_kind=kind)
        for name, day, cents, *until in bills:
            Bill.objects.create(
                category=category, name=name, day=day, amount_cents=cents, from_month=date(2026, 9, 1),
                until_month=until[0] if until else None,
            )
        return category

    def salary(self, **fields):
        category = fields.pop("category", None) or Category.objects.create(name="Salary")
        return ExpectedItem.objects.create(
            name="Salary", direction="in", amount_cents=450000, day=25, category=category, **fields
        )


class PotTests(ForecastCase):
    def test_two_accounts_in_one_pot(self):
        Account.objects.create(name="Revolut", account_type="checking", starting_balance_cents=34000)
        forecast = self.forecast()
        self.assertEqual(forecast["tier"], "everyday")
        self.assertEqual(forecast["start_balance_cents"], 184000)
        self.assertEqual(forecast["points"][0], {"date": TODAY, "balance_cents": 184000})
        self.assertEqual(len(forecast["points"]), 91)

    def test_moving_money_between_them(self):
        revolut = Account.objects.create(name="Revolut", account_type="checking", starting_balance_cents=0)
        link_transfer(self.pay(date(2026, 11, 1), -20000), revolut)
        forecast = self.forecast()
        self.assertEqual(forecast["items"], [])
        self.assertEqual(forecast["points"][-1]["balance_cents"], 150000)

    def test_only_savings_accounts(self):
        self.crelan.archived = True
        self.crelan.save()
        Account.objects.create(name="Spaarrekening", account_type="savings", starting_balance_cents=500000)
        self.assertEqual(self.forecast()["tier"], "savings")


class BillTests(ForecastCase):
    def test_streaming_next_month(self):
        self.streaming(("Netflix", 5, 1799), ("Spotify", 21, 1099))
        december = [i for i in self.items(self.forecast(), "bill") if i[0].month == 12]
        self.assertEqual(december, [(date(2026, 12, 5), "Netflix", -1799), (date(2026, 12, 21), "Spotify", -1099)])

    def test_a_bill_that_ended(self):
        self.streaming(("Disney+", 8, 1199, date(2026, 11, 1)))
        self.assertFalse([i for i in self.items(self.forecast(), "bill") if i[0] >= date(2026, 12, 1)])

    def test_rent_on_the_31st(self):
        category = Category.objects.create(name="Rent", budget_kind="bills")
        Bill.objects.create(category=category, name="Rent", day=31, amount_cents=90000, from_month=date(2026, 9, 1))
        dates = [i[0] for i in self.items(self.forecast(date(2026, 12, 12)), "bill")]
        self.assertIn(date(2027, 2, 28), dates)

    def test_a_loan_category_isnt_forecast_as_bills(self):
        mortgage = Category.objects.create(name="Mortgage")
        loan_account = Account.objects.create(name="House A", account_type="loan", starting_balance_cents=-9000000)
        Loan.objects.create(
            account=loan_account, principal_cents=9000000, annual_rate="0", term_months=100,
            first_payment_date=date(2026, 12, 2), paid_from=self.crelan, payment_category=mortgage, setup_date=TODAY,
        )
        forecast = self.forecast()
        self.assertEqual(self.items(forecast, "bill"), [])
        self.assertEqual(len(self.items(forecast, "installment")), 3)


class InstallmentTests(ForecastCase):
    def loan(self, paid_from):
        account = Account.objects.create(name="House A", account_type="loan", starting_balance_cents=-9000000)
        return Loan.objects.create(
            account=account, principal_cents=9000000, annual_rate="0", term_months=100,
            first_payment_date=date(2026, 12, 2), paid_from=paid_from, setup_date=TODAY,
        )

    def test_the_mortgage(self):
        self.loan(self.crelan)
        self.assertEqual(
            self.items(self.forecast(), "installment"),
            [(date(2026, 12, 2), "House A", -90000), (date(2027, 1, 2), "House A", -90000),
             (date(2027, 2, 2), "House A", -90000)],
        )
        self.assertEqual(self.balances(self.forecast())[date(2026, 12, 2)], 60000)

    def test_paid_from_outside_the_pot(self):
        self.loan(Account.objects.create(name="Spaarrekening", account_type="savings", starting_balance_cents=0))
        self.assertEqual(self.items(self.forecast(), "installment"), [])


class ExpectedItemTests(ForecastCase):
    def test_salary(self):
        self.salary()
        self.assertEqual(
            self.items(self.forecast(), "expected"),
            [(date(2026, 11, 25), "Salary", 450000), (date(2026, 12, 25), "Salary", 450000),
             (date(2027, 1, 25), "Salary", 450000)],
        )

    def test_salary_arrives_early(self):
        item = self.salary()
        self.pay(date(2026, 11, 24), 463000, item.category)
        dates = [i[0] for i in self.items(self.forecast(date(2026, 11, 24)), "expected")]
        self.assertEqual(dates[0], date(2026, 12, 25))

    def test_still_a_guess(self):
        item = self.salary()
        self.pay(date(2026, 11, 24), 463000, item.category, category_confirmed=False)
        dates = [i[0] for i in self.items(self.forecast(date(2026, 11, 24)), "expected")]
        self.assertEqual(dates[0], date(2026, 12, 25))

    def test_a_refund_isnt_the_salary(self):
        item = self.salary()
        self.pay(date(2026, 11, 10), 8000, item.category)
        self.assertEqual(self.items(self.forecast(), "expected")[0][0], date(2026, 11, 25))

    def test_savings_by_transfer(self):
        savings = Account.objects.create(name="Spaarrekening", account_type="savings", starting_balance_cents=0)
        ExpectedItem.objects.create(name="Savings", direction="out", amount_cents=50000, day=1, account=savings)
        link_transfer(self.pay(date(2026, 11, 1), -50000), savings)
        self.assertEqual(self.items(self.forecast(), "expected")[0], (date(2026, 12, 1), "Savings", -50000))

    def test_salary_a_few_days_late(self):
        self.salary()
        first = self.forecast(date(2026, 11, 27))["items"][0]
        self.assertEqual((first["date"], first["late_since"]), (date(2026, 11, 28), date(2026, 11, 25)))

    def test_never_arrived(self):
        self.salary()
        dates = [i[0] for i in self.items(self.forecast(date(2026, 11, 30), 30), "expected")]
        self.assertEqual(dates, [date(2026, 12, 25)])

    def test_income_is_expected_outside_the_window(self):
        item = self.salary()
        self.pay(date(2026, 11, 25), 450000, item.category)
        forecast = self.forecast(date(2026, 11, 26), 30)
        self.assertEqual(self.items(forecast, "expected"), [(date(2026, 12, 25), "Salary", 450000)])
        self.assertTrue(forecast["has_income"])
        self.assertTrue(self.forecast(date(2026, 11, 27), 30)["has_income"])

    def test_no_income_without_in_items(self):
        ExpectedItem.objects.create(
            name="Pocket money", direction="out", amount_cents=5000, day=10,
            category=Category.objects.create(name="Pocket money"),
        )
        self.assertFalse(self.forecast()["has_income"])


class WhatHappenedTests(ForecastCase):
    def test_netflix_paid(self):
        streaming = self.streaming(("Netflix", 5, 1799))
        self.pay(date(2026, 11, 6), -1799, streaming)
        forecast = self.forecast()
        self.assertEqual(self.items(forecast, "bill")[0][0], date(2026, 12, 5))
        self.assertEqual(forecast["missed"], [])

    def test_paid_before_its_day(self):
        streaming = self.streaming(("Spotify", 21, 1099))
        self.pay(date(2026, 11, 12), -1099, streaming)
        self.assertNotIn(date(2026, 11, 21), [i[0] for i in self.items(self.forecast(), "bill")])

    def test_disney_not_seen_yet(self):
        self.streaming(("Disney+", 8, 1199))
        first = self.forecast()["items"][0]
        self.assertEqual((first["date"], first["amount_cents"], first["late_since"]),
                         (date(2026, 11, 13), -1199, date(2026, 11, 8)))

    def test_due_today(self):
        self.streaming(("Netflix", 12, 1799))
        self.assertEqual(self.forecast()["items"][0]["date"], date(2026, 11, 13))

    def test_a_missed_bill(self):
        self.streaming(("Spotify", 21, 1099))
        forecast = self.forecast(date(2026, 11, 28))
        self.assertNotIn(date(2026, 11, 29), [i["date"] for i in forecast["items"]])
        self.assertEqual([(m["date"], m["name"]) for m in forecast["missed"]], [(date(2026, 11, 21), "Spotify")])


class BudgetTests(ForecastCase):
    def limit(self, name, cents, parent=None, month=None):
        category = Category.objects.create(name=name, parent=parent)
        CategoryLimit.objects.create(category=category, month=month, limit_cents=cents)
        return category

    def budget_items(self, forecast):
        return [(i["date"], i["name"], i["amount_cents"]) for i in forecast["items"] if i["source"] == "budget"]

    def test_groceries_this_month(self):
        groceries = self.limit("Groceries", 60000)
        self.pay(date(2026, 11, 3), -38000, groceries)
        forecast = self.forecast()
        self.assertEqual(self.budget_items(forecast)[0], (date(2026, 11, 13), "Groceries", -22000))
        item = forecast["items"][0]
        self.assertEqual(item["detail"]["until"], date(2026, 11, 30))
        start = forecast["start_balance_cents"]
        self.assertEqual(start, 150000 - 38000)
        balances = self.balances(forecast)
        self.assertEqual(balances[date(2026, 11, 13)], start - 22000 // 18)
        self.assertEqual(balances[date(2026, 11, 30)], start - 22000)

    def test_over_the_limit(self):
        groceries = self.limit("Groceries", 60000)
        self.pay(date(2026, 11, 3), -65000, groceries)
        self.assertFalse([i for i in self.budget_items(self.forecast()) if i[0].month == 11])

    def test_next_month(self):
        groceries = self.limit("Groceries", 60000)
        CategoryLimit.objects.create(category=groceries, month=date(2026, 12, 1), limit_cents=80000)
        self.assertIn((date(2026, 12, 1), "Groceries", -80000), self.budget_items(self.forecast()))

    def test_a_cap_inside_a_parent(self):
        food = self.limit("Food", 90000)
        self.limit("Takeaway", 15000, parent=food)
        self.assertEqual({i[1] for i in self.budget_items(self.forecast())}, {"Food"})

    def test_holidays(self):
        holidays = Category.objects.create(name="Holidays", budget_kind="yearly")
        YearlyBudget.objects.create(category=holidays, from_year=2026, amount_cents=300000)
        self.pay(date(2026, 7, 3), -280000, holidays)
        items = self.budget_items(self.forecast())
        self.assertEqual(items[0], (date(2026, 11, 13), "Holidays", -20000))
        january = [i for i in self.forecast()["items"] if i["date"] == date(2027, 1, 1)][0]
        self.assertEqual(january["detail"]["total_cents"], 300000)
        balances = self.balances(self.forecast())
        self.assertEqual(balances[date(2027, 1, 1)] - balances[date(2026, 12, 31)], -(300000 // 365))

    def test_car_insurance(self):
        insurance = Category.objects.create(name="Car insurance", budget_kind="target")
        YearlyBudget.objects.create(category=insurance, from_year=2026, amount_cents=64000, due_month=1, due_day=15)
        self.assertIn((date(2027, 1, 15), "Car insurance", -64000), self.items(self.forecast(), "target"))

    def test_partly_paid(self):
        insurance = Category.objects.create(name="Car insurance", budget_kind="target")
        YearlyBudget.objects.create(category=insurance, from_year=2026, amount_cents=64000, due_month=11, due_day=15)
        self.pay(date(2026, 11, 2), -20000, insurance)
        self.assertEqual(self.items(self.forecast(), "target"), [(date(2026, 11, 15), "Car insurance", -44000)])

    def test_streaming_under_leisure(self):
        leisure = self.limit("Leisure", 30000)
        streaming = self.streaming(("Netflix", 5, 1799), ("Disney+", 8, 1199), ("Spotify", 21, 1099))
        streaming.parent = leisure
        streaming.save()
        self.assertIn((date(2026, 12, 1), "Leisure", -25903), self.budget_items(self.forecast()))


class ExpectedItemApiTests(ForecastCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="budgeter", password="x"))
        self.salary_category = Category.objects.create(name="Salary")
        self.url = reverse("expecteditem-list")

    def post(self, **fields):
        body = {"name": "Salary", "direction": "in", "amount_cents": 450000, "day": 25,
                "category": self.salary_category.id, **fields}
        return self.client.post(self.url, body, format="json")

    def test_create_edit_delete(self):
        response = self.post()
        self.assertEqual(response.status_code, 201, response.json())
        detail = reverse("expecteditem-detail", args=[response.json()["id"]])
        self.assertEqual(self.client.patch(detail, {"amount_cents": 460000}, format="json").status_code, 200)
        self.assertEqual(ExpectedItem.objects.get().amount_cents, 460000)
        self.assertEqual(self.client.delete(detail).status_code, 204)
        self.assertFalse(ExpectedItem.objects.exists())

    def test_rejections(self):
        streaming = self.streaming(("Netflix", 5, 1799))
        groceries = Category.objects.create(name="Groceries")
        CategoryLimit.objects.create(category=groceries, limit_cents=60000)
        snacks = Category.objects.create(name="Snacks", parent=groceries)
        mortgage = Category.objects.create(name="Mortgage")
        Loan.objects.create(
            account=Account.objects.create(name="House", account_type="loan", starting_balance_cents=-100),
            principal_cents=100, annual_rate="0", term_months=1, first_payment_date=date(2026, 12, 2),
            paid_from=self.crelan, payment_category=mortgage, setup_date=TODAY,
        )
        archived = Account.objects.create(name="Old", account_type="savings", starting_balance_cents=0, archived=True)
        cases = {
            "an amount of zero": {"amount_cents": 0},
            "nothing to recognise it by": {"category": None},
            "both": {"account": Account.objects.create(name="Spaar", account_type="savings", starting_balance_cents=0).id},
            "a Bills category": {"category": streaming.id},
            "a monthly limit": {"category": groceries.id},
            "under a budgeted parent": {"category": snacks.id},
            "a loan category": {"category": mortgage.id},
            "an account in the pot": {"category": None, "account": self.crelan.id},
            "an archived account": {"category": None, "account": archived.id},
        }
        for case, fields in cases.items():
            with self.subTest(case):
                self.assertEqual(self.post(**fields).status_code, 400)
        self.assertFalse(ExpectedItem.objects.exists())

    def test_options_leave_out_what_is_already_forecast(self):
        streaming = self.streaming(("Netflix", 5, 1799))
        savings = Account.objects.create(name="Spaarrekening", account_type="savings", starting_balance_cents=0)
        options = self.client.get(reverse("expecteditem-options")).json()
        names = [c["name"] for c in options["categories"]]
        self.assertIn("Salary", names)
        self.assertNotIn(streaming.name, names)
        self.assertEqual([a["id"] for a in options["accounts"]], [savings.id])

    def test_statuses(self):
        item = self.salary(category=self.salary_category)
        with patch("budgets.utils.today", lambda: date(2026, 11, 24)):
            self.assertEqual(self.client.get(self.url).json()[0]["status"], "next")
            self.pay(date(2026, 11, 24), 463000, self.salary_category)
            row = self.client.get(self.url).json()[0]
        self.assertEqual((row["status"], row["received_on"], row["next_on"]), ("received", "2026-11-24", "2026-12-25"))
        Transaction.objects.all().delete()
        with patch("budgets.utils.today", lambda: date(2026, 11, 27)):
            row = self.client.get(self.url).json()[0]
        self.assertEqual((row["status"], row["next_on"]), ("late", "2026-11-28"))
        CategoryLimit.objects.create(category=item.category, limit_cents=100)
        with patch("budgets.utils.today", lambda: date(2026, 11, 27)):
            self.assertEqual(self.client.get(self.url).json()[0]["status"], "budgeted")


class ForecastApiTests(ForecastCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="budgeter", password="x"))

    def get(self, **params):
        with patch("budgets.utils.today", lambda: TODAY):
            return self.client.get(reverse("forecast"), params)

    def test_only_30_or_90_days(self):
        self.assertEqual(self.get(horizon_days=60).status_code, 400)
        self.assertEqual(self.get(horizon_days="x").status_code, 400)
        self.assertEqual(len(self.get(horizon_days=30).json()["points"]), 31)

    def test_each_item_says_where_it_is_kept(self):
        streaming = self.streaming(("Spotify", 21, 1099))
        loan_account = Account.objects.create(name="House A", account_type="loan", starting_balance_cents=-9000000)
        Loan.objects.create(
            account=loan_account, principal_cents=9000000, annual_rate="0", term_months=100,
            first_payment_date=date(2026, 12, 2), paid_from=self.crelan, setup_date=TODAY,
        )
        item = self.salary()
        items = self.get(horizon_days=30).json()["items"]
        links = {i["source"]: i["link"] for i in items}
        self.assertEqual(links["bill"], {"category": streaming.id, "month": "2026-11-01"})
        self.assertEqual(links["installment"], {"account": loan_account.id, "installment": 1})
        self.assertEqual(links["expected"], {"expected": item.id})

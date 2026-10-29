from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from transactions.loans import set_up_loan
from transactions.models import Transaction

from .models import RecurringTransaction
from .utils import generate_forecast


class RecurringTransactionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=200000
        )

    def test_define_a_monthly_bill(self):
        next_month_start = date.today().replace(day=1) + timedelta(days=32)
        next_month_start = next_month_start.replace(day=1)
        response = self.client.post(
            reverse("recurringtransaction-list"),
            {
                "account": self.account.id,
                "amount_cents": -150000,
                "payee": "Rent",
                "frequency": "monthly",
                "start_date": next_month_start.isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(RecurringTransaction.objects.count(), 1)

    def test_editing_amount_only_affects_future_forecasts(self):
        recurring = RecurringTransaction.objects.create(
            account=self.account,
            amount_cents=-150000,
            payee="Rent",
            frequency="monthly",
            start_date=date.today(),
        )
        response = self.client.patch(
            reverse("recurringtransaction-detail", args=[recurring.id]),
            {"amount_cents": -155000},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        recurring.refresh_from_db()
        self.assertEqual(recurring.amount_cents, -155000)

    def test_deleting_recurring_transaction_leaves_past_ledger_transactions_untouched(self):
        recurring = RecurringTransaction.objects.create(
            account=self.account,
            amount_cents=-150000,
            payee="Rent",
            frequency="monthly",
            start_date=date.today() - timedelta(days=30),
        )
        past_rent_payment = Transaction.objects.create(
            account=self.account, date=date.today() - timedelta(days=30),
            amount_cents=-150000, payee="Rent",
        )
        response = self.client.delete(reverse("recurringtransaction-detail", args=[recurring.id]))
        self.assertEqual(response.status_code, 204)
        past_rent_payment.refresh_from_db()
        self.assertEqual(past_rent_payment.amount_cents, -150000)


class ForecastTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=200000
        )
        self.today = date.today()

    def _forecast(self, horizon_days):
        response = self.client.get(
            reverse("forecast"), {"account": self.account.id, "horizon_days": horizon_days}
        )
        return response.json()

    def test_single_recurring_bill(self):
        due_date = self.today + timedelta(days=10)
        RecurringTransaction.objects.create(
            account=self.account,
            amount_cents=-150000,
            payee="Rent",
            frequency="monthly",
            start_date=due_date,
        )
        forecast = self._forecast(30)
        points = {p["date"]: p["balance_cents"] for p in forecast["points"]}

        # Unchanged through day 9.
        for offset in range(0, 10):
            day = (self.today + timedelta(days=offset)).isoformat()
            self.assertEqual(points[day], 200000, f"day {offset}")

        # Drops to 500.00 exactly on the due date...
        self.assertEqual(points[due_date.isoformat()], 50000)

        # ...and stays there through day 30.
        for offset in range(10, 31):
            day = (self.today + timedelta(days=offset)).isoformat()
            self.assertEqual(points[day], 50000, f"day {offset}")

    def test_end_date_stops_future_occurrences(self):
        RecurringTransaction.objects.create(
            account=self.account,
            amount_cents=-5000,
            payee="Expiring subscription",
            frequency="monthly",
            start_date=self.today - timedelta(days=60),
            end_date=self.today - timedelta(days=1),
        )
        forecast = self._forecast(90)
        self.assertEqual(forecast["occurrences"], [])

    def test_forecast_combines_multiple_recurring_transactions(self):
        RecurringTransaction.objects.create(
            account=self.account,
            amount_cents=-150000,
            payee="Rent",
            frequency="monthly",
            start_date=self.today + timedelta(days=5),
        )
        RecurringTransaction.objects.create(
            account=self.account,
            amount_cents=300000,
            payee="Paycheck",
            frequency="biweekly",
            start_date=self.today + timedelta(days=2),
        )
        forecast = self._forecast(30)
        points = {p["date"]: p["balance_cents"] for p in forecast["points"]}

        paycheck_day = (self.today + timedelta(days=2)).isoformat()
        rent_day = (self.today + timedelta(days=5)).isoformat()
        self.assertEqual(points[paycheck_day], 200000 + 300000)
        self.assertEqual(points[rent_day], 200000 + 300000 - 150000)

        # Occurrences are applied in date order and reflect cumulative effect.
        self.assertEqual(len(forecast["occurrences"]), 4)  # 1 rent + 3 paychecks in 30 days
        dates_in_order = [o["date"] for o in forecast["occurrences"]]
        self.assertEqual(dates_in_order, sorted(dates_in_order))

    def test_actual_transaction_does_not_remove_projected_occurrence(self):
        due_date = self.today + timedelta(days=5)
        recurring = RecurringTransaction.objects.create(
            account=self.account,
            amount_cents=-150000,
            payee="Rent",
            frequency="monthly",
            start_date=due_date,
        )
        # Record the "actual" transaction for that same date.
        Transaction.objects.create(
            account=self.account, date=due_date, amount_cents=-150000, payee="Rent"
        )

        forecast = self._forecast(30)
        # The recurring definition is untouched...
        recurring.refresh_from_db()
        self.assertEqual(recurring.start_date, due_date)
        # ...and the forecast still projects its occurrence - no automatic
        # matching/removal against the actual ledger transaction.
        occurrence_dates = [o["date"] for o in forecast["occurrences"]]
        self.assertIn(due_date.isoformat(), occurrence_dates)


class LoanForecastTests(TestCase):
    """The forecasting spec's "A loan is projected along its schedule"."""

    def setUp(self):
        self.crelan = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        self.mortgage = Account.objects.create(name="Mortgage", account_type="loan", starting_balance_cents=0)
        self.set_up = lambda **terms: set_up_loan(  # noqa: E731
            self.mortgage,
            date(2026, 11, 12),
            principal_cents=20000000,
            annual_rate=Decimal("3.00"),
            paid_from=self.crelan,
            payment_category=None,
            **terms,
        )

    def balances(self, forecast):
        return {p["date"]: p["balance_cents"] for p in forecast["points"]}

    def test_the_mortgage_over_the_next_months(self):
        # Set up after the first installment, so it stands at -199,549.03.
        self.set_up(term_months=300, first_payment_date=date(2026, 11, 2))
        forecast = generate_forecast(self.mortgage, 90, today=date(2026, 11, 12))
        balances = self.balances(forecast)
        self.assertEqual(balances["2026-11-12"], -19954903)
        self.assertEqual(balances["2026-12-01"], -19954903)
        self.assertEqual(balances["2026-12-02"], -19909695)
        self.assertEqual(balances["2027-01-02"], -19864376)
        self.assertEqual(
            [o["payee"] for o in forecast["occurrences"]], ["Installment 2 of 300", "Installment 3 of 300", "Installment 4 of 300"]
        )

    def test_after_the_last_installment(self):
        self.set_up(term_months=2, first_payment_date=date(2026, 11, 2))
        balances = self.balances(generate_forecast(self.mortgage, 90, today=date(2026, 11, 12)))
        self.assertEqual(balances["2026-12-02"], 0)
        self.assertEqual(balances["2027-02-09"], 0)

    def test_a_loan_without_a_setup(self):
        RecurringTransaction.objects.create(
            account=self.mortgage, amount_cents=50000, payee="Extra", frequency="monthly", start_date=date(2026, 12, 1)
        )
        balances = self.balances(generate_forecast(self.mortgage, 30, today=date(2026, 11, 12)))
        self.assertEqual(balances["2026-12-01"], 50000)

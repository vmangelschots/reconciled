from collections import namedtuple
from datetime import date

from django.test import SimpleTestCase, TestCase

from accounts.models import Account
from transactions.models import Transaction

from .models import BudgetSettings, Category, CategoryLimit, YearlyBudget
from .summary import budget_rows
from .yearly import (
    budgeted_period,
    is_ahead,
    pace,
    prorated_cents,
    reference_day,
    runway_cents,
    target_counts,
    target_state,
    tolerance_cents,
    values_for_year,
    yearly_rows,
    yearly_spent_cents,
)

Row = namedtuple("Row", "from_year amount_cents due_month due_day")

OCT_2026 = date(2026, 10, 1)


class ProRatingTests(SimpleTestCase):
    def test_starting_in_october(self):
        self.assertEqual(prorated_cents(120000, 2026, OCT_2026), 30000)
        self.assertEqual(prorated_cents(120000, 2027, OCT_2026), 120000)

    def test_starting_in_june(self):
        self.assertEqual(prorated_cents(120000, 2027, date(2027, 6, 1)), 70000)

    def test_rounded_down_to_the_cent(self):
        self.assertEqual(prorated_cents(100000, 2026, date(2026, 11, 1)), 16666)

    def test_no_start_month_counts_in_full(self):
        self.assertEqual(prorated_cents(120000, 2026, None), 120000)

    def test_before_the_start_year(self):
        self.assertIsNone(budgeted_period(2025, OCT_2026))

    def test_budgeted_period(self):
        self.assertEqual(budgeted_period(2026, OCT_2026), (OCT_2026, date(2026, 12, 31)))
        self.assertEqual(budgeted_period(2027, OCT_2026), (date(2027, 1, 1), date(2027, 12, 31)))
        self.assertEqual(budgeted_period(2026, None), (date(2026, 1, 1), date(2026, 12, 31)))


class TargetInStartYearTests(SimpleTestCase):
    def test_due_after_the_start(self):
        self.assertTrue(target_counts(date(2026, 11, 1), OCT_2026))

    def test_due_before_the_start(self):
        self.assertFalse(target_counts(date(2026, 3, 15), OCT_2026))
        self.assertTrue(target_counts(date(2027, 3, 15), OCT_2026))

    def test_due_on_the_start_day(self):
        self.assertTrue(target_counts(date(2026, 10, 1), OCT_2026))


class ValuesForYearTests(SimpleTestCase):
    def test_raise_next_years_budget(self):
        rows = [Row(2026, 120000, None, None), Row(2027, 150000, None, None)]
        self.assertEqual(values_for_year(rows, 2026).amount_cents, 120000)
        self.assertEqual(values_for_year(rows, 2027).amount_cents, 150000)
        self.assertEqual(values_for_year(rows, 2030).amount_cents, 150000)

    def test_moving_a_due_date(self):
        rows = [Row(2026, 40000, 11, 1), Row(2027, 40000, 10, 15)]
        self.assertEqual((values_for_year(rows, 2026).due_month, values_for_year(rows, 2026).due_day), (11, 1))
        self.assertEqual((values_for_year(rows, 2027).due_month, values_for_year(rows, 2027).due_day), (10, 15))

    def test_added_mid_year_counts_the_whole_year(self):
        # A budget first set in 2027 also covers earlier years, so the
        # month it was added never matters.
        rows = [Row(2027, 120000, None, None)]
        self.assertEqual(values_for_year(rows, 2026).amount_cents, 120000)

    def test_no_rows(self):
        self.assertIsNone(values_for_year([], 2026))


class RunwayAndPaceTests(SimpleTestCase):
    def test_runway_in_october(self):
        self.assertEqual(runway_cents(12000, date(2026, 10, 24)), 4000)

    def test_runway_is_whole_euros(self):
        self.assertEqual(runway_cents(10000, date(2026, 10, 24)), 3300)

    def test_pace_from_the_start_month(self):
        period = budgeted_period(2026, OCT_2026)
        self.assertEqual(int(pace(period, date(2026, 10, 31)) * 100), 33)

    def test_over_for_the_year_is_not_ahead(self):
        # Over is its own state; ahead is only for budgets not yet over.
        self.assertFalse(is_ahead(33000, 30000, 0.26))

    def test_running_ahead(self):
        self.assertTrue(is_ahead(27000, 30000, 24 / 92))

    def test_on_pace_is_not_ahead(self):
        self.assertFalse(is_ahead(18000, 30000, 24 / 92))
        self.assertFalse(is_ahead(27000, 30000, 0.95))


class ReferenceDayTests(SimpleTestCase):
    def test_current_month_is_today(self):
        self.assertEqual(reference_day(date(2026, 10, 1), date(2026, 10, 24)), date(2026, 10, 24))

    def test_other_month_is_its_last_day(self):
        self.assertEqual(reference_day(date(2026, 9, 1), date(2026, 10, 24)), date(2026, 9, 30))


DUE = date(2026, 11, 1)


class TargetStateTests(SimpleTestCase):
    def test_tolerance(self):
        self.assertEqual(tolerance_cents(40000), 2000)
        self.assertEqual(tolerance_cents(12000), 1000)

    def test_due_soon(self):
        self.assertEqual(target_state(0, 40000, DUE, date(2026, 10, 24)), "due_soon")

    def test_due_today_is_due_soon(self):
        self.assertEqual(target_state(0, 40000, DUE, DUE), "due_soon")

    def test_fourteen_days_out(self):
        self.assertEqual(target_state(0, 40000, DUE, date(2026, 10, 18)), "due_soon")
        self.assertEqual(target_state(0, 40000, DUE, date(2026, 10, 17)), "upcoming")

    def test_paid_early(self):
        self.assertEqual(target_state(40000, 40000, DUE, date(2026, 10, 20)), "paid")

    def test_not_seen_yet(self):
        self.assertEqual(target_state(0, 40000, DUE, date(2026, 11, 4)), "not_seen")

    def test_grace_ends_after_seven_days(self):
        self.assertEqual(target_state(0, 40000, DUE, date(2026, 11, 8)), "not_seen")
        self.assertEqual(target_state(0, 40000, DUE, date(2026, 11, 9)), "overdue")

    def test_overdue(self):
        self.assertEqual(target_state(0, 40000, DUE, date(2026, 11, 9)), "overdue")

    def test_paid_over(self):
        self.assertEqual(target_state(45000, 40000, DUE, date(2026, 11, 9)), "paid_over")

    def test_partly_paid(self):
        self.assertEqual(target_state(30000, 40000, DUE, date(2026, 11, 9)), "partly_paid")

    def test_slightly_under(self):
        self.assertEqual(target_state(39812, 40000, DUE, date(2026, 11, 9)), "paid")

    def test_the_tolerance_has_a_floor(self):
        self.assertEqual(target_state(12900, 12000, DUE, date(2026, 11, 9)), "paid")

    def test_exactly_at_the_tolerance(self):
        self.assertEqual(target_state(42000, 40000, DUE, date(2026, 11, 9)), "paid")
        self.assertEqual(target_state(42001, 40000, DUE, date(2026, 11, 9)), "paid_over")
        self.assertEqual(target_state(38000, 40000, DUE, date(2026, 11, 9)), "paid")
        self.assertEqual(target_state(37999, 40000, DUE, date(2026, 11, 9)), "partly_paid")

    def test_nothing_spent_is_never_paid(self):
        self.assertEqual(target_state(0, 500, DUE, date(2026, 11, 20)), "overdue")


class YearlyRowsTests(TestCase):
    def setUp(self):
        self.account = Account.objects.create(name="Main", account_type="checking", starting_balance_cents=0)
        self.clothing = self._yearly("Clothing", 120000)

    def _yearly(self, name, amount_cents, from_year=2026, due=None):
        kind = Category.BudgetKind.TARGET if due else Category.BudgetKind.YEARLY
        category = Category.objects.create(name=name, budget_kind=kind)
        YearlyBudget.objects.create(
            category=category, from_year=from_year, amount_cents=amount_cents,
            due_month=due[0] if due else None, due_day=due[1] if due else None,
        )
        return category

    def _spend(self, category, day, cents):
        Transaction.objects.create(account=self.account, date=day, amount_cents=-cents, payee="x", category=category)

    def _start(self, month):
        BudgetSettings.objects.update_or_create(pk=1, defaults={"start_month": month})

    def _row(self, month, today, category=None):
        rows = yearly_rows(month, today)["categories"]
        return next(r for r in rows if r["category_id"] == (category or self.clothing).id)

    def test_spending_in_any_month_counts(self):
        self._spend(self.clothing, "2026-02-10", 30000)
        self._spend(self.clothing, "2026-06-10", 50000)
        row = self._row(date(2026, 6, 1), date(2026, 10, 24))
        self.assertEqual((row["spent_cents"], row["remaining_cents"]), (80000, 40000))

    def test_a_new_year_starts_fresh(self):
        self._spend(self.clothing, "2026-02-10", 80000)
        row = self._row(date(2027, 1, 1), date(2027, 1, 10))
        self.assertEqual((row["budget_cents"], row["spent_cents"]), (120000, 0))

    def test_spending_before_the_start_is_ignored(self):
        self._start(OCT_2026)
        self._spend(self.clothing, "2026-08-10", 25000)
        self._spend(self.clothing, "2026-10-10", 8000)
        row = self._row(date(2026, 10, 1), date(2026, 10, 24))
        self.assertEqual(row["spent_cents"], 8000)
        self.assertEqual((row["budget_cents"], row["prorated_from"]), (30000, OCT_2026))

    def test_no_start_month(self):
        self._spend(self.clothing, "2026-02-10", 25000)
        row = self._row(date(2026, 10, 1), date(2026, 10, 24))
        self.assertEqual((row["budget_cents"], row["spent_cents"], row["prorated_from"]), (120000, 25000, None))

    def test_monthly_budgets_are_unaffected(self):
        self._start(OCT_2026)
        groceries = Category.objects.create(name="Groceries")
        CategoryLimit.objects.create(category=groceries, month=None, limit_cents=40000)
        self._spend(groceries, "2026-09-10", 12000)
        row = budget_rows(date(2026, 9, 1))[0]
        self.assertEqual((row["limit_cents"], row["spent_cents"]), (40000, 12000))

    def test_viewing_an_earlier_month_of_the_year(self):
        self._spend(self.clothing, "2026-10-10", 18000)
        self._spend(self.clothing, "2026-11-10", 9000)
        result = yearly_rows(date(2026, 10, 1), date(2026, 12, 5))
        self.assertEqual(result["through"], date(2026, 10, 31))
        self.assertEqual(self._row(date(2026, 10, 1), date(2026, 12, 5))["spent_cents"], 18000)

    def test_past_month_has_no_runway_or_pace(self):
        row = self._row(date(2026, 10, 1), date(2026, 12, 5))
        self.assertEqual((row["runway_cents"], row["pace"]), (None, None))

    def test_viewing_a_month_before_the_start(self):
        self._start(OCT_2026)
        result = yearly_rows(date(2026, 9, 1), date(2026, 10, 24))
        self.assertEqual((result["starts"], result["categories"]), (OCT_2026, []))

    def test_running_ahead(self):
        self._start(OCT_2026)
        self._spend(self.clothing, "2026-10-10", 27000)
        row = self._row(date(2026, 10, 1), date(2026, 10, 24))
        self.assertTrue(row["ahead"])
        self.assertEqual(row["runway_cents"], 1000)

    def test_runway_in_october(self):
        self._start(OCT_2026)
        self._spend(self.clothing, "2026-10-10", 18000)
        row = self._row(date(2026, 10, 1), date(2026, 10, 24))
        self.assertEqual((row["remaining_cents"], row["runway_cents"]), (12000, 4000))

    def test_over_for_the_year(self):
        self._start(OCT_2026)
        self._spend(self.clothing, "2026-10-10", 33000)
        row = self._row(date(2026, 10, 1), date(2026, 10, 24))
        self.assertTrue(row["over"])
        self.assertIsNone(row["runway_cents"])

    def test_target_row(self):
        tax = self._yearly("Property tax", 40000, due=(11, 1))
        row = self._row(date(2026, 10, 1), date(2026, 10, 24), tax)
        self.assertEqual((row["due_date"], row["state"], row["budget_cents"]), (date(2026, 11, 1), "due_soon", 40000))

    def test_target_due_before_the_start_is_not_listed(self):
        self._start(OCT_2026)
        car_tax = self._yearly("Car tax", 25000, due=(3, 15))
        ids = [r["category_id"] for r in yearly_rows(date(2026, 10, 1), date(2026, 10, 24))["categories"]]
        self.assertNotIn(car_tax.id, ids)
        ids = [r["category_id"] for r in yearly_rows(date(2027, 3, 1), date(2027, 3, 2))["categories"]]
        self.assertIn(car_tax.id, ids)

    def test_yearly_categories_are_not_in_the_monthly_summary(self):
        self._spend(self.clothing, "2026-10-10", 18000)
        self.assertEqual(budget_rows(date(2026, 10, 1)), [])

    def test_yearly_spent_is_the_months_spending(self):
        tax = self._yearly("Property tax", 40000, due=(11, 1))
        self._spend(self.clothing, "2026-10-10", 18000)
        self._spend(self.clothing, "2026-09-10", 5000)
        self._spend(tax, "2026-10-20", 40000)
        self.assertEqual(yearly_spent_cents(date(2026, 10, 1)), 58000)

    def test_query_count_does_not_grow_with_categories(self):
        BudgetSettings.objects.create(pk=1)
        for i in range(5):
            self._spend(self._yearly(f"Y{i}", 1000), "2026-01-05", 100)
        with self.assertNumQueries(4):
            result = yearly_rows(date(2026, 1, 1), date(2026, 1, 10))
        self.assertEqual(len(result["categories"]), 6)

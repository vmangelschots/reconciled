"""Bills budgets - see openspec/specs/bill-budgets."""

from datetime import date
from unittest.mock import patch

from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from django.urls import reverse
from households.testing import TestCase
from rest_framework.test import APIClient

from accounts.models import Account
from transactions.models import Transaction
from transactions.splits import SplitLine, save_split

from .bills import Outflow, bill_rows, bill_state, due_date, match
from .models import Bill, Category, CategoryLimit, YearlyBudget
from .summary import subcategories_by_parent

NOV_2026 = date(2026, 11, 1)


class BillModelTests(TestCase):
    def setUp(self):
        self.streaming = Category.objects.create(name="Streaming", budget_kind="bills")

    def _bill(self, **values):
        return Bill(category=self.streaming, name="Netflix", from_month=NOV_2026, **{"day": 5, "amount_cents": 1799, **values})

    def test_a_valid_bill(self):
        self._bill().full_clean()

    def test_day_must_be_in_a_month(self):
        for day in (0, 32):
            with self.assertRaises(ValidationError):
                self._bill(day=day).full_clean()

    def test_a_bill_needs_an_amount(self):
        with self.assertRaises(ValidationError):
            self._bill(amount_cents=0).full_clean()


@patch("budgets.utils.today", lambda: date(2026, 11, 19))
class BillsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=get_user_model().objects.create_user(username="b", password="x"))
        self.streaming = Category.objects.create(name="Streaming")

    def _set_budget(self, category, **body):
        return self.client.put(reverse("category-set-budget", args=[category.id]), body, format="json")

    def _set_bills(self, category, bills):
        return self.client.put(reverse("category-set-bills", args=[category.id]), {"bills": bills}, format="json")

    def _make_bills(self):
        self.streaming.budget_kind = "bills"
        self.streaming.save()

    def test_monthly_to_bills_drops_the_limits(self):
        CategoryLimit.objects.create(category=self.streaming, month=None, limit_cents=4500)
        response = self._set_budget(self.streaming, kind="bills")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["budget_kind"], "bills")
        self.assertEqual(response.json()["bills"], [])
        self.assertFalse(CategoryLimit.objects.exists())

    def test_yearly_to_bills_drops_the_yearly_amounts(self):
        self.streaming.budget_kind = "yearly"
        self.streaming.save()
        YearlyBudget.objects.create(category=self.streaming, from_year=2026, amount_cents=50000)
        self._set_budget(self.streaming, kind="bills")
        self.assertFalse(YearlyBudget.objects.exists())

    def test_bills_to_monthly_drops_the_bills(self):
        self._make_bills()
        Bill.objects.create(category=self.streaming, name="Netflix", day=5, amount_cents=1799, from_month=NOV_2026)
        response = self._set_budget(self.streaming, kind="monthly", amount_cents=4500)
        self.assertEqual(response.json()["budget_kind"], "monthly")
        self.assertFalse(Bill.objects.exists())

    def test_no_monthly_limit_on_bills(self):
        self._make_bills()
        response = self.client.put(
            reverse("category-set-limit", args=[self.streaming.id]), {"month": None, "limit_cents": 100}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_add_bills(self):
        self._make_bills()
        response = self._set_bills(
            self.streaming,
            [
                {"name": "Spotify", "day": 21, "amount_cents": 1099},
                {"name": "Netflix", "day": 5, "amount_cents": 1799},
            ],
        )
        self.assertEqual(response.status_code, 200)
        bills = response.json()["bills"]
        self.assertEqual([(b["name"], b["day"], b["amount_cents"], b["from_month"]) for b in bills], [
            ("Netflix", 5, 1799, "2026-11"),
            ("Spotify", 21, 1099, "2026-11"),
        ])

    def _bills(self):
        return sorted((b.name, b.amount_cents, b.from_month, b.until_month) for b in Bill.objects.all())

    def test_a_price_change_keeps_earlier_months(self):
        self._make_bills()
        netflix = Bill.objects.create(category=self.streaming, name="Netflix", day=5, amount_cents=1799, from_month=date(2026, 9, 1))
        response = self._set_bills(self.streaming, [{"id": netflix.id, "name": "Netflix", "day": 5, "amount_cents": 1999}])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._bills(), [
            ("Netflix", 1799, date(2026, 9, 1), date(2026, 10, 1)),
            ("Netflix", 1999, NOV_2026, None),
        ])
        self.assertEqual([(b["name"], b["amount_cents"]) for b in response.json()["bills"]], [("Netflix", 1999)])

    def test_removing_a_bill_keeps_earlier_months(self):
        self._make_bills()
        Bill.objects.create(category=self.streaming, name="Disney+", day=8, amount_cents=1199, from_month=date(2026, 9, 1))
        self._set_bills(self.streaming, [])
        self.assertEqual(self._bills(), [("Disney+", 1199, date(2026, 9, 1), date(2026, 10, 1))])

    def test_a_change_in_the_bills_first_month(self):
        self._make_bills()
        spotify = Bill.objects.create(category=self.streaming, name="Spotify", day=21, amount_cents=1099, from_month=NOV_2026)
        self._set_bills(self.streaming, [{"id": spotify.id, "name": "Spotify", "day": 21, "amount_cents": 1199}])
        self.assertEqual(self._bills(), [("Spotify", 1199, NOV_2026, None)])
        self._set_bills(self.streaming, [])
        self.assertEqual(self._bills(), [])

    def test_unchanged_bills_stay_one_bill(self):
        self._make_bills()
        netflix = Bill.objects.create(category=self.streaming, name="Netflix", day=5, amount_cents=1799, from_month=date(2026, 9, 1))
        self._set_bills(self.streaming, [{"id": netflix.id, "name": "Netflix", "day": 5, "amount_cents": 1799}])
        self.assertEqual(self._bills(), [("Netflix", 1799, date(2026, 9, 1), None)])

    def test_saving_from_october_applies_from_october_on(self):
        self._make_bills()
        netflix = Bill.objects.create(category=self.streaming, name="Netflix", day=5, amount_cents=1799, from_month=date(2026, 9, 1))
        response = self.client.put(
            reverse("category-set-bills", args=[self.streaming.id]),
            {"month": "2026-10", "bills": [{"id": netflix.id, "name": "Netflix", "day": 5, "amount_cents": 1999}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self._bills(), [
            ("Netflix", 1799, date(2026, 9, 1), date(2026, 9, 1)),
            ("Netflix", 1999, date(2026, 10, 1), None),
        ])

    def test_an_ended_bill_isnt_an_id_to_edit(self):
        self._make_bills()
        old = Bill.objects.create(
            category=self.streaming, name="Netflix", day=5, amount_cents=1799, from_month=date(2026, 9, 1), until_month=date(2026, 10, 1)
        )
        self.assertEqual(self._set_bills(self.streaming, [{"id": old.id, "name": "x", "day": 5, "amount_cents": 1}]).status_code, 400)

    def test_rejects_bad_lines(self):
        self._make_bills()
        for line in (
            {"name": "", "day": 5, "amount_cents": 1799},
            {"name": "Netflix", "day": 0, "amount_cents": 1799},
            {"name": "Netflix", "day": 32, "amount_cents": 1799},
            {"name": "Netflix", "day": 5, "amount_cents": 0},
            {"name": "Netflix", "day": 5, "amount_cents": "17.99"},
        ):
            self.assertEqual(self._set_bills(self.streaming, [line]).status_code, 400, line)
        self.assertFalse(Bill.objects.exists())

    def test_rejects_another_categorys_bill(self):
        self._make_bills()
        other = Category.objects.create(name="Internet", budget_kind="bills")
        bill = Bill.objects.create(category=other, name="Proximus", day=3, amount_cents=2500, from_month=NOV_2026)
        response = self._set_bills(self.streaming, [{"id": bill.id, "name": "x", "day": 3, "amount_cents": 100}])
        self.assertEqual(response.status_code, 400)

    def test_only_a_bills_category_takes_bills(self):
        response = self._set_bills(self.streaming, [{"name": "Netflix", "day": 5, "amount_cents": 1799}])
        self.assertEqual(response.status_code, 400)

    def test_no_bills_for_a_tab(self):
        tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        jan = Category.objects.create(name="Jan", parent=tabs)
        self.assertEqual(self._set_budget(jan, kind="bills").status_code, 400)
        self.assertEqual(self._set_bills(jan, []).status_code, 400)


def bill(bill_id, day, cents):
    return SimpleNamespace(id=bill_id, day=day, amount_cents=cents)


def out(tx_id, day, cents, month=11):
    return Outflow(tx_id, date(2026, month, day), cents)


class DueDateTests(SimpleTestCase):
    def test_the_31st_in_february(self):
        self.assertEqual(due_date(date(2027, 2, 1), 31), date(2027, 2, 28))

    def test_an_ordinary_day(self):
        self.assertEqual(due_date(NOV_2026, 21), date(2026, 11, 21))


class MatchTests(SimpleTestCase):
    def test_a_day_late(self):
        self.assertEqual(match([bill(1, 5, 1799)], [out(10, 6, 1799)], NOV_2026), {1: out(10, 6, 1799)})

    def test_too_far_from_its_day_still_pays(self):
        self.assertEqual(match([bill(1, 21, 1099)], [out(10, 27, 1099)], NOV_2026), {1: out(10, 27, 1099)})

    def test_not_across_months(self):
        self.assertEqual(match([bill(1, 30, 2500)], [out(10, 2, 2500, month=12)], NOV_2026), {})

    def test_outside_the_amount_window(self):
        # 15% of 17.99 is 2.69; 21.00 is 3.01 away.
        self.assertEqual(match([bill(1, 5, 1799)], [out(10, 5, 2100)], NOV_2026), {})

    def test_small_bills_have_a_2_euro_window(self):
        self.assertIn(1, match([bill(1, 21, 1099)], [out(10, 21, 1299)], NOV_2026))
        # The old 5.00 window no longer matches.
        self.assertEqual(match([bill(1, 21, 1099)], [out(10, 21, 1599)], NOV_2026), {})

    def test_far_from_the_amount(self):
        self.assertEqual(match([bill(1, 21, 1099)], [out(10, 21, 800)], NOV_2026), {})

    def test_the_closest_amount_wins(self):
        result = match([bill(1, 5, 1799)], [out(10, 5, 1599), out(11, 4, 1799)], NOV_2026)
        self.assertEqual(result[1].id, 11)

    def test_every_payee_is_paypal(self):
        bills = [bill(1, 5, 1799), bill(2, 8, 1199), bill(3, 21, 1099)]
        outflows = [out(10, 6, 1099), out(11, 9, 1799), out(12, 22, 1199)]
        result = match(bills, outflows, NOV_2026)
        self.assertEqual({b: o.cents for b, o in result.items()}, {1: 1799, 2: 1199, 3: 1099})

    def test_an_earlier_bill_doesnt_take_a_later_bills_payment(self):
        # On 22 November: Disney+ (8th) unpaid, Spotify (21st) paid 10.99.
        result = match([bill(1, 8, 1199), bill(2, 21, 1099)], [out(10, 21, 1099)], NOV_2026)
        self.assertEqual(list(result), [2])

    def test_same_amount_three_days_apart(self):
        result = match([bill(1, 3, 2500), bill(2, 6, 2500)], [out(10, 3, 2500), out(11, 6, 2500)], NOV_2026)
        self.assertEqual((result[1].id, result[2].id), (10, 11))

    def test_two_bills_of_the_same_amount(self):
        result = match([bill(1, 3, 2500), bill(2, 3, 2500)], [out(10, 3, 2500), out(11, 3, 2500)], NOV_2026)
        self.assertEqual({result[1].id, result[2].id}, {10, 11})

    def test_an_outflow_pays_one_bill(self):
        result = match([bill(1, 3, 2500), bill(2, 4, 2500)], [out(10, 3, 2500)], NOV_2026)
        self.assertEqual(list(result), [1])


class BillStateTests(SimpleTestCase):
    DUE = date(2026, 11, 21)

    def state(self, ref_day, payment=None, month_over=False, future=False, cents=1099):
        return bill_state(cents, self.DUE, payment, ref_day, month_over, future)

    def test_paid(self):
        self.assertEqual(bill_state(1799, date(2026, 11, 5), out(1, 5, 1799), date(2026, 11, 19), False, False), "paid")

    def test_a_price_rise_is_paid_over(self):
        self.assertEqual(bill_state(1799, date(2026, 11, 5), out(1, 5, 1999), date(2026, 11, 19), False, False), "paid_over")

    def test_a_price_drop_is_paid_under(self):
        self.assertEqual(bill_state(1799, date(2026, 11, 5), out(1, 5, 1599), date(2026, 11, 19), False, False), "paid_under")

    def test_within_the_tolerance_is_paid(self):
        self.assertEqual(bill_state(1799, date(2026, 11, 5), out(1, 5, 1899), date(2026, 11, 19), False, False), "paid")

    def test_upcoming_then_due_soon(self):
        self.assertEqual(self.state(date(2026, 11, 17)), "upcoming")
        self.assertEqual(self.state(date(2026, 11, 18)), "due_soon")
        self.assertEqual(self.state(date(2026, 11, 19)), "due_soon")
        self.assertEqual(self.state(self.DUE), "due_soon")

    def test_not_seen_then_missed(self):
        for day in range(22, 27):
            self.assertEqual(self.state(date(2026, 11, day)), "not_seen", day)
        self.assertEqual(self.state(date(2026, 11, 27)), "missed")

    def test_a_finished_month(self):
        self.assertEqual(bill_state(1099, date(2026, 10, 30), None, date(2026, 10, 31), True, False), "missed")

    def test_a_future_month(self):
        self.assertEqual(self.state(date(2026, 11, 19), future=True), "upcoming")


class BillRowsTests(TestCase):
    def setUp(self):
        self.account = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        self.streaming = Category.objects.create(name="Streaming", budget_kind="bills")
        for name, day, cents in (("Netflix", 5, 1799), ("Disney+", 8, 1199), ("Spotify", 21, 1099)):
            Bill.objects.create(category=self.streaming, name=name, day=day, amount_cents=cents, from_month=date(2026, 9, 1))

    def _pay(self, on, cents, category=None):
        return Transaction.objects.create(
            account=self.account, date=on, amount_cents=-cents, payee="x", category=category or self.streaming
        )

    def _rows(self, month, today):
        categories = list(Category.objects.prefetch_related("bills"))
        return bill_rows(categories, subcategories_by_parent(categories), month, today)

    def test_two_of_three_paid(self):
        self._pay(date(2026, 11, 5), 1799)
        self._pay(date(2026, 11, 9), 1199)
        row = self._rows(NOV_2026, date(2026, 11, 19))[self.streaming.id]
        self.assertEqual(row["budget_cents"], 4097)
        self.assertEqual([b["state"] for b in row["bills"]], ["paid", "paid", "due_soon"])
        self.assertEqual(row["bills"][1]["paid_on"], date(2026, 11, 9))
        self.assertEqual(row["paid_count"], 2)
        self.assertEqual(row["due_to_date_cents"], 2998)
        self.assertEqual(row["unpaid_cents"], 1099)

    def test_an_ended_bill_no_longer_counts(self):
        Bill.objects.filter(name="Disney+").update(until_month=date(2026, 10, 1))
        october = self._rows(date(2026, 10, 1), date(2026, 11, 19))[self.streaming.id]
        november = self._rows(NOV_2026, date(2026, 11, 19))[self.streaming.id]
        self.assertEqual([b["name"] for b in october["bills"]], ["Netflix", "Disney+", "Spotify"])
        self.assertEqual([b["name"] for b in november["bills"]], ["Netflix", "Spotify"])

    def test_a_bill_counts_from_its_month(self):
        Bill.objects.create(category=self.streaming, name="Apple TV", day=12, amount_cents=999, from_month=NOV_2026)
        october = self._rows(date(2026, 10, 1), date(2026, 11, 19))[self.streaming.id]
        november = self._rows(NOV_2026, date(2026, 11, 19))[self.streaming.id]
        self.assertEqual(october["budget_cents"], 4097)
        self.assertEqual(november["budget_cents"], 5096)

    def test_a_split_part_pays_a_bill(self):
        line = Transaction.objects.create(account=self.account, date=date(2026, 11, 5), amount_cents=-3000, payee="Card")
        save_split(line, [SplitLine(-1799, category=self.streaming), SplitLine(-1201)])
        row = self._rows(NOV_2026, date(2026, 11, 19))[self.streaming.id]
        self.assertEqual(row["bills"][0]["state"], "paid")

    def test_a_subcategory_payment_counts(self):
        kids = Category.objects.create(name="Kids", parent=self.streaming)
        self._pay(date(2026, 11, 8), 1199, category=kids)
        row = self._rows(NOV_2026, date(2026, 11, 19))[self.streaming.id]
        self.assertEqual(row["bills"][1]["state"], "paid")

    def test_paid_under_and_its_difference(self):
        self._pay(date(2026, 11, 5), 1599)
        netflix = self._rows(NOV_2026, date(2026, 11, 19))[self.streaming.id]["bills"][0]
        self.assertEqual((netflix["state"], netflix["difference_cents"]), ("paid_under", -200))

    def test_payments_that_pay_no_bill(self):
        self._pay(date(2026, 11, 5), 1799)
        Transaction.objects.create(account=self.account, date=date(2026, 11, 18), amount_cents=-799, payee="PayPal", category=self.streaming)
        row = self._rows(NOV_2026, date(2026, 11, 19))[self.streaming.id]
        self.assertEqual(row["extras"], [{"id": row["extras"][0]["id"], "date": date(2026, 11, 18), "payee": "PayPal", "amount_cents": 799}])

    def test_review_this_month_and_the_one_before(self):
        today = date(2026, 11, 19)
        self.assertEqual(
            [self._rows(m, today)[self.streaming.id]["review"] for m in (NOV_2026, date(2026, 10, 1), date(2026, 9, 1))],
            [True, True, False],
        )

    def test_no_bills_no_row(self):
        empty = Category.objects.create(name="Internet", budget_kind="bills")
        self.assertNotIn(empty.id, self._rows(NOV_2026, date(2026, 11, 19)))


class BillsInTheMonthTests(TestCase):
    """Bills rows, totals, pace and attention - through both endpoints."""

    TODAY = date(2026, 11, 19)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=get_user_model().objects.create_user(username="m", password="x"))
        self.account = Account.objects.create(name="Crelan", account_type="checking", starting_balance_cents=0)
        self.streaming = Category.objects.create(name="Streaming", budget_kind="bills")
        for name, day, cents in (("Netflix", 5, 1799), ("Disney+", 8, 1199), ("Spotify", 21, 1099)):
            Bill.objects.create(category=self.streaming, name=name, day=day, amount_cents=cents, from_month=date(2026, 9, 1))
        self.groceries = Category.objects.create(name="Groceries")
        CategoryLimit.objects.create(category=self.groceries, month=None, limit_cents=40000)

    def _pay(self, on, cents, category=None):
        Transaction.objects.create(
            account=self.account, date=on, amount_cents=-cents, payee="x", category=category or self.streaming
        )

    def _summary(self, today=None, month="2026-11"):
        today = today or self.TODAY
        with patch("budgets.utils.today", lambda: today):
            return self.client.get(reverse("budget-summary"), {"month": month}).json()

    def _overview(self, today=None, month="2026-11"):
        today = today or self.TODAY
        with patch("budgets.utils.today", lambda: today), patch("reports.views._today", lambda: today):
            return self.client.get(reverse("report-overview"), {"month": month}).json()

    def _row(self, summary, category):
        return next(r for r in summary["categories"] if r["category_id"] == category.id)

    def test_a_bills_row(self):
        self._pay(date(2026, 11, 5), 1799)
        self._pay(date(2026, 11, 9), 1199)
        row = self._row(self._summary(), self.streaming)
        self.assertEqual(row["kind"], "bills")
        self.assertEqual(row["limit_cents"], 4097)
        self.assertEqual([b["state"] for b in row["bills"]], ["paid", "paid", "due_soon"])
        self.assertEqual(self._row(self._summary(), self.groceries)["kind"], "monthly")

    def test_limits_and_bills_together(self):
        totals = self._summary()["totals"]
        self.assertEqual(totals["limit_cents"], 44097)

    def test_a_bills_subcategory_is_a_cap(self):
        home = Category.objects.create(name="Home")
        CategoryLimit.objects.create(category=home, month=None, limit_cents=10000)
        internet = Category.objects.create(name="Internet", parent=home, budget_kind="bills")
        Bill.objects.create(category=internet, name="Proximus", day=3, amount_cents=4500, from_month=NOV_2026)
        summary = self._summary()
        self.assertTrue(self._row(summary, internet)["covered_by_parent"])
        self.assertEqual(self._row(summary, home)["caps_cents"], 4500)
        self.assertEqual(summary["totals"]["limit_cents"], 44097 + 10000)

    def test_a_bills_category_without_bills_has_no_budget(self):
        empty = Category.objects.create(name="Internet", budget_kind="bills")
        self._pay(date(2026, 11, 3), 2500, category=empty)
        summary = self._summary()
        self.assertIsNone(self._row(summary, empty)["limit_cents"])
        self.assertEqual(summary["totals"]["outside_cents"], 2500)

    def test_pace_with_bills(self):
        # The spec's example: on 10 November, 900.00 of limits of which 300.00
        # are bills, 200.00 of them due; 100.00 of the bills unpaid.
        Bill.objects.all().delete()
        CategoryLimit.objects.all().delete()
        CategoryLimit.objects.create(category=self.groceries, month=None, limit_cents=60000)
        for name, day in (("Rent A", 1), ("Rent B", 5), ("Rent C", 25)):
            Bill.objects.create(category=self.streaming, name=name, day=day, amount_cents=10000, from_month=NOV_2026)
        self._pay(date(2026, 11, 1), 10000)
        self._pay(date(2026, 11, 5), 10000)
        totals = self._summary(today=date(2026, 11, 10))["totals"]
        self.assertAlmostEqual(totals["marker"], (20000 + 60000 / 3) / 90000)
        self.assertEqual(int(totals["marker"] * 100), 44)
        self.assertEqual(totals["bills_unpaid_cents"], 10000)

    def test_no_bills_marker_is_the_pace(self):
        Category.objects.filter(id=self.streaming.id).update(budget_kind="monthly")
        summary = self._summary()
        self.assertEqual(summary["totals"]["marker"], summary["pace"])

    def test_a_past_month_has_no_marker(self):
        totals = self._summary(month="2026-10")["totals"]
        self.assertIsNone(totals["marker"])
        self.assertIsNone(totals["bills_unpaid_cents"])

    def test_all_paid_early_is_not_ahead(self):
        self._pay(date(2026, 11, 5), 1799)
        self._pay(date(2026, 11, 8), 1199)
        self._pay(date(2026, 11, 8), 1099)
        Bill.objects.filter(name="Spotify").update(day=8)
        for response in (self._summary(today=date(2026, 11, 8)), self._overview(today=date(2026, 11, 8))):
            self.assertEqual(response["attention"]["categories"], [])

    def test_a_small_price_rise_isnt_over(self):
        self._pay(date(2026, 11, 5), 1999)
        self._pay(date(2026, 11, 9), 1199)
        self._pay(date(2026, 11, 19), 1099)
        summary = self._summary()
        self.assertFalse(self._row(summary, self.streaming)["over_limit"])
        self.assertEqual(summary["attention"]["categories"], [])

    def test_extra_spending_money_is_over(self):
        money = Category.objects.create(name="Spending money", budget_kind="bills")
        for name in ("Vincent", "Partner"):
            Bill.objects.create(category=money, name=name, day=1, amount_cents=20000, from_month=NOV_2026)
        self._pay(date(2026, 11, 1), 20000, category=money)
        self._pay(date(2026, 11, 1), 20000, category=money)
        self._pay(date(2026, 11, 15), 5000, category=money)
        attention = self._summary()["attention"]
        self.assertEqual([(c["name"], c["over"]) for c in attention["categories"]], [("Spending money", True)])
        self.assertEqual(attention["categories"][0]["spent_cents"] - attention["categories"][0]["limit_cents"], 5000)

    def test_a_missed_bill(self):
        self._pay(date(2026, 11, 5), 1799)
        self._pay(date(2026, 11, 8), 1199)
        for response in (self._summary(today=date(2026, 11, 28)), self._overview(today=date(2026, 11, 28))):
            bills = response["attention"]["bills"]
            self.assertEqual(
                [(b["name"], b["category_name"], b["due_date"], b["amount_cents"]) for b in bills],
                [("Spotify", "Streaming", "2026-11-21", 1099)],
            )

    def test_not_seen_is_not_listed(self):
        self._pay(date(2026, 11, 5), 1799)
        self._pay(date(2026, 11, 8), 1199)
        self.assertEqual(self._summary(today=date(2026, 11, 23))["attention"]["bills"], [])

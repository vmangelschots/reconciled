from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category
from transactions.adjustments import set_value
from transactions.models import Transaction
from transactions.splits import SplitLine, save_split
from transactions.transfers import link_transfer

TODAY = date(2026, 10, 24)


class SpendingCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="u", password="x"))
        self.checking = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)
        self.savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        self.supermarket = Category.objects.create(name="Supermarket", parent=self.groceries)
        self.home = Category.objects.create(name="Home")

    def txn(self, amount_cents, on, category=None, account=None):
        return Transaction.objects.create(
            account=account or self.checking, date=on, amount_cents=amount_cents, payee="bank line", category=category
        )

    def get(self, start="2026-01", end="2026-09"):
        return self.client.get(reverse("report-spending"), {"start": start, "end": end})

    def body(self, **kwargs):
        response = self.get(**kwargs)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def row(self, report, name):
        return next(r for r in report["categories"] if r["name"] == name)


@patch("reports.views._today", lambda: TODAY)
class PeriodTests(SpendingCase):
    def test_too_long(self):
        self.assertEqual(self.get(start="2024-09", end="2026-09").status_code, 400)
        self.assertEqual(self.get(start="2024-10", end="2026-09").status_code, 200)

    def test_past_the_current_month(self):
        self.assertEqual(self.get(start="2026-01", end="2026-11").status_code, 400)

    def test_end_before_start(self):
        self.assertEqual(self.get(start="2026-05", end="2026-04").status_code, 400)

    def test_malformed(self):
        self.assertEqual(self.get(start="march").status_code, 400)
        self.assertEqual(self.client.get(reverse("report-spending")).status_code, 400)

    def test_data_starts_in_march(self):
        self.txn(-100, date(2026, 3, 2))
        report = self.body(start="2025-10", end="2026-09")
        self.assertEqual(report["months"][0], "2026-03")
        self.assertEqual(report["months"][-1], "2026-09")
        self.assertEqual(len(report["months"]), 7)

    def test_no_transactions(self):
        report = self.body()
        self.assertFalse(report["has_data"])
        self.assertEqual(report["months"], [])

    def test_a_period_before_the_data(self):
        self.txn(-100, date(2026, 3, 2))
        report = self.body(start="2025-01", end="2025-12")
        self.assertTrue(report["has_data"])
        self.assertEqual(report["months"], [])

    def test_only_this_month(self):
        self.txn(-100, date(2026, 10, 2))
        report = self.body(start="2026-10", end="2026-10")
        self.assertEqual(report["months"], ["2026-10"])
        self.assertEqual(report["full_months"], [])


@patch("reports.views._today", lambda: TODAY)
class FiguresTests(SpendingCase):
    def test_spending_on_a_closed_card(self):
        card = Account.objects.create(
            name="Old card", account_type="credit_card", starting_balance_cents=0, archived=True
        )
        self.txn(-8000, date(2026, 3, 2), self.home, account=card)
        report = self.body(start="2026-03", end="2026-03")
        self.assertEqual(self.row(report, "Home")["cents"], [8000])
        self.assertEqual(report["in_out"][0]["out_cents"], 8000)

    def test_refund_bigger_than_spending(self):
        self.txn(-2000, date(2026, 3, 2), self.home)
        self.txn(5500, date(2026, 3, 9), self.home)
        self.txn(-10000, date(2026, 4, 9), self.home)
        self.assertEqual(self.row(self.body(start="2026-03", end="2026-04"), "Home")["cents"], [-3500, 10000])

    def test_subcategories_roll_up_and_list_direct(self):
        self.txn(-5000, date(2026, 3, 2), self.groceries)
        self.txn(-20000, date(2026, 3, 3), self.supermarket)
        row = self.row(self.body(start="2026-03", end="2026-03"), "Groceries")
        self.assertEqual(row["cents"], [25000])
        self.assertEqual(
            [(c["name"], c["direct"], c["cents"]) for c in row["children"]],
            [("Supermarket", False, [20000]), ("Groceries (direct)", True, [5000])],
        )

    def test_no_direct_row_when_it_is_zero(self):
        self.txn(-20000, date(2026, 3, 3), self.supermarket)
        row = self.row(self.body(start="2026-03", end="2026-03"), "Groceries")
        self.assertEqual([c["name"] for c in row["children"]], ["Supermarket"])

    def test_no_children_without_subcategory_spending(self):
        self.txn(-5000, date(2026, 3, 2), self.groceries)
        self.assertEqual(self.row(self.body(start="2026-03", end="2026-03"), "Groceries")["children"], [])

    def test_a_category_without_spending_is_left_out(self):
        self.txn(-100, date(2026, 3, 2), self.home)
        self.assertEqual([r["name"] for r in self.body()["categories"]], ["Home"])

    def test_salary_is_income_not_spending(self):
        salary = Category.objects.create(name="Income")
        self.txn(320000, date(2026, 3, 1), salary)
        self.txn(320000, date(2026, 4, 1), salary)
        self.txn(-10000, date(2026, 3, 2), self.home)
        report = self.body(start="2026-03", end="2026-04")
        self.assertEqual([r["name"] for r in report["categories"]], ["Home"])
        self.assertEqual(report["income_categories"][0]["name"], "Income")
        self.assertEqual(report["income_categories"][0]["cents"], [320000, 320000])
        self.assertEqual(report["income"]["cents"], [320000, 320000])
        self.assertEqual(report["spending"]["cents"], [10000, 0])
        self.assertEqual(report["net"]["cents"], [310000, 320000])

    def test_refunds_beat_spending_over_the_period(self):
        self.txn(-100000, date(2026, 3, 2), self.home)
        self.txn(120000, date(2026, 4, 2), self.home)
        report = self.body(start="2026-03", end="2026-04")
        self.assertEqual(report["categories"], [])
        self.assertEqual(report["income_categories"][0]["cents"], [-100000, 120000])
        self.assertEqual(report["income_categories"][0]["total_cents"], 20000)

    def test_an_income_parent_flips_its_subcategories(self):
        salary = Category.objects.create(name="Income")
        bonus = Category.objects.create(name="Bonus", parent=salary)
        self.txn(100000, date(2026, 3, 1), salary)
        self.txn(50000, date(2026, 3, 2), bonus)
        row = self.body(start="2026-03", end="2026-03")["income_categories"][0]
        self.assertEqual(row["cents"], [150000])
        self.assertEqual(
            [(c["name"], c["cents"]) for c in row["children"]], [("Income (direct)", [100000]), ("Bonus", [50000])]
        )

    def test_uncategorized_goes_by_direction(self):
        self.txn(-4000, date(2026, 3, 2))
        self.txn(50000, date(2026, 3, 3))
        report = self.body(start="2026-03", end="2026-03")
        self.assertEqual(report["uncategorized"]["cents"], [4000])
        self.assertEqual(report["uncategorized_income"]["cents"], [50000])
        self.assertEqual(report["income"]["cents"], [50000])

    def test_a_split_counts_through_its_parts(self):
        txn = self.txn(-6000, date(2026, 3, 2))
        save_split(txn, [SplitLine(-4000, category=self.groceries), SplitLine(-2000, transfer_account=self.savings)])
        report = self.body(start="2026-03", end="2026-03")
        self.assertEqual(self.row(report, "Groceries")["cents"], [4000])
        self.assertIsNone(report["uncategorized"])
        self.assertEqual(report["spending"]["cents"], [4000])

    def test_transfers_and_value_adjustments_dont_count(self):
        link_transfer(self.txn(-50000, date(2026, 3, 3)), self.savings)
        funds = Account.objects.create(name="Funds", account_type="investment", starting_balance_cents=0)
        set_value(funds, date(2026, 3, 5), 800000)
        self.txn(-100, date(2026, 3, 9), self.home)
        report = self.body(start="2026-03", end="2026-03")
        self.assertEqual(report["in_out"], [{"month": "2026-03", "in_cents": 0, "out_cents": 100}])

    def test_a_months_figures(self):
        self.txn(290000, date(2026, 3, 1), Category.objects.create(name="Income"))
        self.txn(10000, date(2026, 3, 2), self.home)
        self.txn(-200000, date(2026, 3, 3), self.home)
        report = self.body(start="2026-03", end="2026-03")
        self.assertEqual(report["spending"]["cents"], [190000])
        self.assertEqual(report["net"]["cents"], [100000])
        self.assertEqual(report["income"]["cents"], [290000])
        self.assertEqual(report["savings_rate"]["percents"], [34])
        self.assertEqual(report["savings_rate"]["total"], 34)

    def test_no_rate_without_income(self):
        self.txn(-100, date(2026, 3, 2), self.home)
        report = self.body(start="2026-03", end="2026-03")
        self.assertEqual(report["savings_rate"]["percents"], [None])


@patch("reports.views._today", lambda: TODAY)
class AverageTests(SpendingCase):
    def test_a_month_without_spending_counts(self):
        self.txn(-100, date(2025, 10, 1), self.home)
        self.txn(-12000, date(2026, 3, 2), self.groceries)
        report = self.body(start="2025-10", end="2026-09")
        self.assertEqual(self.row(report, "Groceries")["avg_cents"], 1000)

    def test_current_month_is_left_out(self):
        self.txn(-9000, date(2026, 1, 2), self.home)
        self.txn(-500000, date(2026, 10, 2), self.home)
        report = self.body(start="2026-01", end="2026-10")
        self.assertEqual(len(report["full_months"]), 9)
        self.assertEqual(self.row(report, "Home")["avg_cents"], 1000)
        self.assertEqual(self.row(report, "Home")["total_cents"], 509000)

    def test_a_first_month_starting_late_is_left_out(self):
        self.txn(-90000, date(2026, 3, 6), self.home)
        self.assertEqual(self.body(start="2026-03", end="2026-05")["full_months"], ["2026-04", "2026-05"])

    def test_a_first_month_starting_by_the_5th_is_full(self):
        self.txn(-90000, date(2026, 3, 5), self.home)
        self.assertIn("2026-03", self.body(start="2026-03", end="2026-05")["full_months"])

    def test_too_little_data(self):
        self.txn(-100, date(2026, 9, 1), self.home)
        report = self.body(start="2026-09", end="2026-10")
        self.assertEqual(report["full_months"], ["2026-09"])
        self.assertIsNone(self.row(report, "Home")["avg_cents"])


@patch("reports.views._today", lambda: TODAY)
class SpendingCellTests(SpendingCase):
    def cell(self, **params):
        response = self.client.get(reverse("report-spending-cell"), {"month": "2026-03", **params})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def test_a_parents_cell_adds_up(self):
        Account.objects.filter(pk=self.savings.pk).update(archived=True)
        self.txn(-5000, date(2026, 3, 2), self.groceries)
        self.txn(-20000, date(2026, 3, 3), self.supermarket, account=self.savings)
        self.txn(1500, date(2026, 3, 4), self.groceries)
        self.txn(-999, date(2026, 4, 1), self.groceries)
        cell = self.cell(category=self.groceries.id)
        report = self.body(start="2026-03", end="2026-03")
        self.assertEqual(cell["total_cents"], self.row(report, "Groceries")["cents"][0])
        self.assertEqual([r["amount_cents"] for r in cell["rows"]], [-20000, -5000, 1500])
        self.assertEqual(cell["accounts"], ["Checking", "Savings"])
        self.assertEqual(cell["name"], "Groceries")

    def test_direct_leaves_out_subcategories(self):
        self.txn(-5000, date(2026, 3, 2), self.groceries)
        self.txn(-20000, date(2026, 3, 3), self.supermarket)
        cell = self.cell(category=self.groceries.id, direct="1")
        self.assertEqual(cell["total_cents"], 5000)
        self.assertEqual(cell["name"], "Groceries (direct)")

    def test_a_part_of_a_split(self):
        txn = self.txn(-6000, date(2026, 3, 2))
        save_split(txn, [SplitLine(-4000, category=self.groceries), SplitLine(-2000, category=self.home)])
        rows = self.cell(category=self.groceries.id)["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["amount_cents"], -4000)
        self.assertEqual(rows[0]["split_amount_cents"], -6000)

    def test_uncategorized_counts_outflows_only(self):
        self.txn(-4000, date(2026, 3, 2))
        self.txn(200000, date(2026, 3, 3))
        cell = self.cell(category="uncategorized")
        self.assertEqual(cell["total_cents"], 4000)
        self.assertTrue(cell["uncategorized"])
        self.assertEqual(len(cell["rows"]), 1)

    def test_an_income_cell(self):
        salary = Category.objects.create(name="Income")
        self.txn(100, date(2026, 3, 1), salary)
        self.txn(320000, date(2026, 3, 2), salary)
        self.txn(-500, date(2026, 3, 3), salary)
        cell = self.cell(category=salary.id, income="1")
        self.assertEqual(cell["total_cents"], 319600)
        self.assertEqual([r["amount_cents"] for r in cell["rows"]], [320000, 100, -500])

    def test_uncategorized_income(self):
        self.txn(-4000, date(2026, 3, 2))
        self.txn(50000, date(2026, 3, 3))
        cell = self.cell(category="uncategorized", income="1")
        self.assertEqual(cell["total_cents"], 50000)
        self.assertEqual(cell["name"], "Uncategorized income")

    def test_rejects_bad_input(self):
        url = reverse("report-spending-cell")
        self.assertEqual(self.client.get(url, {"month": "2026-03"}).status_code, 400)
        self.assertEqual(self.client.get(url, {"category": "1"}).status_code, 400)
        self.assertEqual(self.client.get(url, {"month": "2026-03", "category": "0"}).status_code, 404)
        self.assertEqual(self.client.get(url, {"month": "2026-03", "category": "x"}).status_code, 404)

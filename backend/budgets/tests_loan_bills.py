"""Loan payment categories take their bills from the loans - see
openspec/specs/bill-budgets and loan-schedules."""

from datetime import date
from decimal import Decimal
from importlib import import_module

from django.apps import apps
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from unittest.mock import patch

from transactions.loans import add_correction, edit_loan, remove_loan, schedule, sync_loan
from transactions.tests_loans import LoanTestCase, euros

from .attention import attention_bills
from .loan_bills import loan_lines
from .summary import budget_rows, budget_totals

from transactions.models import Transaction

from .models import Bill, Category, CategoryLimit, YearlyBudget


class AdoptAndReleaseTests(LoanTestCase):
    def setUp(self):
        super().setUp()
        self.house_b = self.account("House B", "loan")
        CategoryLimit.objects.create(category=self.mortgage_category, month=None, limit_cents=140000)
        CategoryLimit.objects.create(category=self.mortgage_category, month=date(2026, 12, 1), limit_cents=150000)

    def kind(self):
        self.mortgage_category.refresh_from_db()
        return self.mortgage_category.budget_kind

    def test_setting_up_replaces_the_budget(self):
        self.set_up(category=self.mortgage_category)
        self.assertEqual(self.kind(), "bills")
        self.assertFalse(CategoryLimit.objects.exists())

    def test_yearly_budgets_and_bills_go_too(self):
        clothing = Category.objects.create(name="Clothing", budget_kind="bills")
        Bill.objects.create(category=clothing, name="x", day=1, amount_cents=100, from_month=date(2026, 10, 1))
        tax = Category.objects.create(name="Tax", budget_kind="yearly")
        YearlyBudget.objects.create(category=tax, from_year=2026, amount_cents=100)
        self.set_up(category=clothing)
        self.set_up(account=self.house_b, category=tax)
        self.assertFalse(Bill.objects.exists())
        self.assertFalse(YearlyBudget.objects.exists())

    def test_a_second_loan_joins(self):
        self.set_up(category=self.mortgage_category)
        self.set_up(account=self.house_b, principal=80000, category=self.mortgage_category)
        self.assertEqual(self.kind(), "bills")

    def test_clearing_the_only_loans_category(self):
        loan = self.set_up(category=self.mortgage_category)
        edit_loan(loan, date(2026, 10, 21), payment_category=None)
        self.assertEqual(self.kind(), "monthly")
        self.assertFalse(CategoryLimit.objects.exists())

    def test_moving_to_another_category(self):
        loan = self.set_up(category=self.mortgage_category)
        rent = Category.objects.create(name="Rent")
        CategoryLimit.objects.create(category=rent, month=None, limit_cents=1000)
        edit_loan(loan, date(2026, 10, 21), payment_category=rent)
        rent.refresh_from_db()
        self.assertEqual((self.kind(), rent.budget_kind), ("monthly", "bills"))
        self.assertFalse(rent.limits.exists())

    def test_removing_the_only_loan(self):
        loan = self.set_up(category=self.mortgage_category)
        remove_loan(loan)
        self.assertEqual(self.kind(), "monthly")

    def test_removing_one_of_two(self):
        loan = self.set_up(category=self.mortgage_category)
        self.set_up(account=self.house_b, principal=80000, category=self.mortgage_category)
        remove_loan(loan)
        self.assertEqual(self.kind(), "bills")

    def test_editing_the_rate_leaves_the_category(self):
        loan = self.set_up(category=self.mortgage_category)
        Bill.objects.create(category=self.mortgage_category, name="sneaked in", day=1, amount_cents=1, from_month=date(2026, 10, 1))
        edit_loan(loan, date(2026, 10, 21), annual_rate=Decimal("2.90"))
        self.assertEqual(self.kind(), "bills")
        self.assertTrue(Bill.objects.exists())


class LoanCategoryApiTests(LoanTestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=get_user_model().objects.create_user(username="l", password="x"))
        self.set_up(category=self.mortgage_category)

    def put(self, name, body):
        return self.client.put(reverse(name, args=[self.mortgage_category.id]), body, format="json")

    def test_no_hand_budget(self):
        for name, body in (
            ("category-set-limit", {"month": None, "limit_cents": 100}),
            ("category-set-budget", {"kind": "monthly", "amount_cents": 100}),
            ("category-set-bills", {"bills": [{"name": "x", "day": 1, "amount_cents": 100}]}),
        ):
            response = self.put(name, body)
            self.assertEqual(response.status_code, 400, name)
            self.assertEqual(response.json()["detail"], "Its loans set this budget. Change it on the loan.")
        payment = Transaction.objects.create(account=self.crelan, date=date(2026, 11, 3), amount_cents=-3500, payee="x", category=self.mortgage_category)
        response = self.client.post(
            reverse("category-bill-from-payment", args=[self.mortgage_category.id]), {"transaction": payment.id, "name": "x"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Its loans set this budget. Change it on the loan.")

    def categories(self):
        return {c["name"]: c for c in self.client.get(reverse("category-list")).json()}

    def test_lists_its_loans(self):
        self.assertEqual(self.categories()["Mortgage"]["loans"], [{"account_id": self.mortgage.id, "name": "Mortgage"}])
        self.assertEqual(self.categories()["Housing"]["loans"], [])

    def test_an_archived_loan_doesnt_count(self):
        self.mortgage.archived = True
        self.mortgage.save()
        self.assertEqual(self.categories()["Mortgage"]["loans"], [])
        self.assertEqual(self.put("category-set-bills", {"bills": []}).status_code, 200)


class AdoptAtUpgradeTests(LoanTestCase):
    def test_an_existing_payment_category_switches(self):
        migration = import_module("budgets.migrations.0010_loan_categories_follow_loans")
        loan = self.set_up()
        CategoryLimit.objects.create(category=self.mortgage_category, month=None, limit_cents=140000)
        # As before this version: a payment category set without adopting.
        type(loan).objects.filter(pk=loan.pk).update(payment_category=self.mortgage_category)
        migration.adopt_loan_categories(apps, None)
        self.mortgage_category.refresh_from_db()
        self.assertEqual(self.mortgage_category.budget_kind, "bills")
        self.assertFalse(CategoryLimit.objects.exists())

        migration.release_loan_categories(apps, None)
        self.mortgage_category.refresh_from_db()
        self.assertEqual(self.mortgage_category.budget_kind, "monthly")



NOV = date(2026, 11, 1)
DEC = date(2026, 12, 1)


class TwoHouseLoans(LoanTestCase):
    """Two house loans paying into "Mortgage" on the 7th."""

    def setUp(self):
        super().setUp()
        self.house_b = self.account("House B", "loan")
        self.a = self.set_up(first=date(2026, 11, 7), category=self.mortgage_category)
        self.b = self.set_up(account=self.house_b, principal=80000, first=date(2026, 11, 7), category=self.mortgage_category)
        self.pay_a = schedule(self.a)[0].payment_cents
        self.pay_b = schedule(self.b)[0].payment_cents

    def lines(self, month=NOV, today=date(2026, 11, 19)):
        return loan_lines(month, today).get(self.mortgage_category.id, [])

    def pay(self, loan, on, cents):
        payment = Transaction.objects.create(account=self.crelan, date=on, amount_cents=-cents, payee="BNP")
        sync_loan(loan, on)
        return payment


class LoanLinesTests(TwoHouseLoans):
    def test_two_house_loans(self):
        lines = self.lines()
        self.assertEqual([(l["name"], l["day"], l["amount_cents"]) for l in lines], [
            ("House B", 7, self.pay_b),
            ("Mortgage", 7, self.pay_a),
        ])
        self.assertTrue(all(l["source"] == "loan" for l in lines))

    def test_matched_on_the_8th(self):
        self.pay(self.a, date(2026, 11, 8), self.pay_a)
        line = next(l for l in self.lines() if l["loan_account_id"] == self.mortgage.id)
        self.assertEqual((line["state"], line["paid_on"], line["paid_cents"]), ("paid", date(2026, 11, 8), self.pay_a))

    def test_not_seen_then_missed(self):
        self.assertEqual({l["state"] for l in self.lines(today=date(2026, 11, 10))}, {"not_seen"})
        self.assertEqual({l["state"] for l in self.lines(today=date(2026, 11, 13))}, {"missed"})
        self.assertEqual({l["state"] for l in self.lines(today=date(2027, 1, 5))}, {"missed"})

    def test_a_future_month(self):
        self.assertEqual({l["state"] for l in self.lines(month=DEC)}, {"upcoming"})

    def test_a_correction_lowers_december(self):
        self.pay(self.a, date(2026, 11, 7), self.pay_a)
        add_correction(self.a, date(2026, 11, 12), date(2026, 11, 12), euros(150000), payment_cents=98000)
        self.assertIn(self.pay_a, [l["amount_cents"] for l in self.lines(today=date(2026, 11, 12))])
        december = {l["name"]: l["amount_cents"] for l in self.lines(month=DEC, today=date(2026, 11, 12))}
        self.assertEqual(december["Mortgage"], 98000)

    def test_a_covered_installment(self):
        add_correction(self.a, date(2026, 11, 12), date(2026, 11, 12), euros(195000))
        self.assertEqual([l["name"] for l in self.lines(today=date(2026, 11, 12))], ["House B"])

    def test_before_the_setup_day(self):
        self.assertEqual(self.lines(month=date(2026, 10, 1), today=date(2026, 11, 19)), [])

    def test_a_paid_off_loan(self):
        car = self.account("Car loan", "loan")
        self.set_up(account=car, principal=1200, rate="0.00", term=5, first=date(2026, 11, 7), category=self.housing)
        months = [date(2027, 3, 1), date(2027, 4, 1)]
        self.assertEqual([len(loan_lines(m, date(2026, 11, 19)).get(self.housing.id, [])) for m in months], [1, 0])

    def test_the_same_queries_for_more_loans(self):
        with self.assertNumQueries(3):
            loan_lines(NOV, date(2026, 11, 19))
        car = self.account("Car loan", "loan")
        self.set_up(account=car, principal=10000, first=date(2026, 11, 7), category=self.housing)
        with self.assertNumQueries(3):
            loan_lines(NOV, date(2026, 11, 19))


class LoanBillsInTheMonthTests(TwoHouseLoans):
    def rows(self, today=date(2026, 11, 19)):
        with patch("budgets.utils.today", lambda: today):
            return budget_rows(NOV, today)

    def row(self, rows):
        return next(r for r in rows if r["category_id"] == self.mortgage_category.id)

    def test_the_budget_counts(self):
        rows = self.rows()
        self.assertEqual(self.row(rows)["limit_cents"], self.pay_a + self.pay_b)
        self.assertEqual(budget_totals(rows, 0.5)["limit_cents"], self.pay_a + self.pay_b)

    def test_insurance_is_over(self):
        self.pay(self.a, date(2026, 11, 7), self.pay_a)
        self.pay(self.b, date(2026, 11, 7), self.pay_b)
        for payment in Transaction.objects.filter(amount_cents__in=[-self.pay_a, -self.pay_b]):
            payment.category = self.mortgage_category
            payment.save()
        LoanTestCase.pay(self, date(2026, 11, 10), -35, category=self.mortgage_category)
        row = self.row(self.rows())
        self.assertTrue(row["over_limit"])
        self.assertEqual(row["spent_cents"] - row["limit_cents"], 3500)

    def test_a_missed_loan_bill_isnt_a_bill_warning(self):
        self.assertTrue(any(b["state"] == "missed" for b in self.row(self.rows(date(2026, 11, 19)))["bills"]))
        self.assertEqual(attention_bills(self.rows(date(2026, 11, 19))), [])


class BudgetsPageSyncsLoansTests(TwoHouseLoans):
    def test_a_new_payment_shows_as_paid(self):
        client = APIClient()
        client.force_authenticate(user=get_user_model().objects.create_user(username="s", password="x"))
        # Arrives after setup; nothing has synced the loan since.
        Transaction.objects.create(account=self.crelan, date=date(2026, 11, 7), amount_cents=-self.pay_a, payee="BNP")
        with patch("budgets.utils.today", lambda: date(2026, 11, 19)):
            summary = client.get(reverse("budget-summary"), {"month": "2026-11"}).json()
        row = next(r for r in summary["categories"] if r["category_id"] == self.mortgage_category.id)
        states = {b["name"]: b["state"] for b in row["bills"]}
        self.assertEqual(states["Mortgage"], "paid")

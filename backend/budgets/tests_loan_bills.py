"""Loan payment categories take their bills from the loans - see
openspec/specs/bill-budgets and loan-schedules."""

from datetime import date
from decimal import Decimal
from importlib import import_module

from django.apps import apps
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from transactions.loans import edit_loan, remove_loan
from transactions.tests_loans import LoanTestCase

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

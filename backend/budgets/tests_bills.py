"""Bills budgets - see openspec/specs/bill-budgets."""

from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.urls import reverse
from households.testing import TestCase
from rest_framework.test import APIClient

from .models import Bill, Category, CategoryLimit, YearlyBudget

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

    def test_editing_keeps_the_start_month_and_left_out_bills_go(self):
        self._make_bills()
        netflix = Bill.objects.create(category=self.streaming, name="Netflix", day=5, amount_cents=1799, from_month=date(2026, 9, 1))
        Bill.objects.create(category=self.streaming, name="Disney+", day=8, amount_cents=1199, from_month=date(2026, 9, 1))
        response = self._set_bills(self.streaming, [{"id": netflix.id, "name": "Netflix", "day": 6, "amount_cents": 1999}])
        self.assertEqual(response.status_code, 200)
        netflix.refresh_from_db()
        self.assertEqual((netflix.day, netflix.amount_cents, netflix.from_month), (6, 1999, date(2026, 9, 1)))
        self.assertEqual(Bill.objects.count(), 1)

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

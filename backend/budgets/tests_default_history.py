"""A default monthly limit that applies from a month on - see
openspec/specs/budgets, "A default limit applies from a month on" and
"Editing the default edits the one in effect"."""

from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from households.testing import TestCase

from .models import Category, CategoryLimit
from .summary import monthly_limits


def limit(category, month):
    return monthly_limits(month, loan_lines={})[0].get(category.id)


class DefaultInEffectTests(TestCase):
    def setUp(self):
        self.groceries = Category.objects.create(name="Groceries")

    def test_a_new_default_from_july(self):
        CategoryLimit.objects.create(category=self.groceries, limit_cents=65000)
        CategoryLimit.objects.create(category=self.groceries, from_month=date(2027, 7, 1), limit_cents=55000)

        self.assertEqual(limit(self.groceries, date(2027, 6, 1)), 65000)
        self.assertEqual(limit(self.groceries, date(2027, 7, 1)), 55000)
        self.assertEqual(limit(self.groceries, date(2028, 3, 1)), 55000)

    def test_before_the_first_default(self):
        CategoryLimit.objects.create(category=self.groceries, from_month=date(2027, 7, 1), limit_cents=55000)

        self.assertEqual(limit(self.groceries, date(2027, 3, 1)), 55000)

    def test_the_earliest_default_covers_earlier_months(self):
        CategoryLimit.objects.create(category=self.groceries, from_month=date(2027, 7, 1), limit_cents=55000)
        CategoryLimit.objects.create(category=self.groceries, from_month=date(2027, 1, 1), limit_cents=60000)

        self.assertEqual(limit(self.groceries, date(2026, 11, 1)), 60000)

    def test_overrides_still_win(self):
        CategoryLimit.objects.create(category=self.groceries, limit_cents=65000)
        CategoryLimit.objects.create(category=self.groceries, from_month=date(2027, 7, 1), limit_cents=55000)
        CategoryLimit.objects.create(category=self.groceries, month=date(2027, 12, 1), limit_cents=80000)

        self.assertEqual(limit(self.groceries, date(2027, 12, 1)), 80000)
        self.assertEqual(limit(self.groceries, date(2027, 11, 1)), 55000)


@patch("budgets.utils.today", lambda: date(2027, 3, 14))
class EditingTheDefaultTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=get_user_model().objects.create_user(username="b", password="x"))
        self.groceries = Category.objects.create(name="Groceries")
        CategoryLimit.objects.create(category=self.groceries, limit_cents=65000)
        CategoryLimit.objects.create(category=self.groceries, from_month=date(2027, 7, 1), limit_cents=55000)

    def _set(self, cents, in_effect=None):
        data = {"limit_cents": cents}
        if in_effect:
            data["in_effect"] = in_effect
        return self.client.put(reverse("category-set-limit", args=[self.groceries.id]), data, format="json")

    def test_editing_in_march(self):
        self.assertEqual(self._set(60000, "2027-03").status_code, 200)

        self.assertEqual(limit(self.groceries, date(2027, 1, 1)), 60000)
        self.assertEqual(limit(self.groceries, date(2027, 6, 1)), 60000)
        self.assertEqual(limit(self.groceries, date(2027, 7, 1)), 55000)

    def test_editing_in_september(self):
        self._set(60000, "2027-03")
        self._set(50000, "2027-09")

        self.assertEqual(limit(self.groceries, date(2027, 6, 1)), 60000)
        self.assertEqual(limit(self.groceries, date(2027, 7, 1)), 50000)

    def test_without_a_month_edits_this_months_default(self):
        self._set(61000)

        self.assertEqual(limit(self.groceries, date(2027, 3, 1)), 61000)
        self.assertEqual(limit(self.groceries, date(2027, 8, 1)), 55000)

    def test_the_category_lists_its_defaults(self):
        response = self.client.get(reverse("category-detail", args=[self.groceries.id]))

        self.assertEqual(
            response.json()["monthly_limits"],
            {
                "default_cents": 65000,
                "defaults": [
                    {"from_month": None, "limit_cents": 65000},
                    {"from_month": "2027-07", "limit_cents": 55000},
                ],
                "override_count": 0,
            },
        )

    def test_remove_after_a_plan_was_applied(self):
        response = self.client.delete(reverse("category-set-budget", args=[self.groceries.id]))

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(limit(self.groceries, date(2027, 3, 1)))
        self.assertIsNone(limit(self.groceries, date(2027, 9, 1)))

    def test_switching_kind_deletes_every_default(self):
        response = self.client.put(
            reverse("category-set-budget", args=[self.groceries.id]),
            {"kind": "yearly", "amount_cents": 700000},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(CategoryLimit.objects.filter(category=self.groceries).exists())

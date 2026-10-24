from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category

from .models import Transaction


class TabApiTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="u", password="x"))
        self.joint = Account.objects.create(name="Joint", account_type="checking", starting_balance_cents=0)
        self.restaurants = Category.objects.create(name="Restaurants")
        self.tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        self.jan = Category.objects.create(name="Jan", parent=self.tabs)

    def txn(self, amount_cents, day, payee="bank line", month=10, **kwargs):
        return Transaction.objects.create(
            account=kwargs.pop("account", self.joint),
            date=date(2026, month, day),
            amount_cents=amount_cents,
            payee=payee,
            **kwargs,
        )


class TabGroupIsNotAssignableTests(TabApiTestCase):
    def setUp(self):
        super().setUp()
        self.dinner = self.txn(-6000, 3, payee="Pizzeria")

    def assertUnchanged(self):
        self.dinner.refresh_from_db()
        self.assertIsNone(self.dinner.category)
        self.assertFalse(self.dinner.parts.exists())

    def test_patch(self):
        response = self.client.patch(
            reverse("transaction-detail", args=[self.dinner.pk]), {"category": self.tabs.pk}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("category", response.json())
        self.assertUnchanged()

    def test_create(self):
        response = self.client.post(
            reverse("transaction-list"),
            {"account": self.joint.pk, "date": "2026-10-04", "amount_cents": -100, "payee": "x", "category": self.tabs.pk},
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_a_tab_is_fine(self):
        response = self.client.patch(
            reverse("transaction-detail", args=[self.dinner.pk]), {"category": self.jan.pk}, format="json"
        )

        self.assertEqual(response.status_code, 200)

    def test_split_line(self):
        response = self.client.put(
            reverse("transaction-split", args=[self.dinner.pk]),
            {"parts": [{"amount_cents": -3000, "category": self.restaurants.pk},
                       {"amount_cents": -3000, "category": self.tabs.pk}]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["line"], 1)
        self.assertUnchanged()

    def test_unsplit_keep(self):
        self.client.put(
            reverse("transaction-split", args=[self.dinner.pk]),
            {"parts": [{"amount_cents": -3000, "category": self.restaurants.pk},
                       {"amount_cents": -3000, "category": self.jan.pk}]},
            format="json",
        )

        response = self.client.delete(
            reverse("transaction-split", args=[self.dinner.pk]), {"category": self.tabs.pk}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.dinner.parts.count(), 2)

    def test_bulk_confirm(self):
        response = self.client.post(
            reverse("transaction-confirm-categories"), {"ids": [self.dinner.pk], "category": self.tabs.pk}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertUnchanged()


class TabEndpointTests(TabApiTestCase):
    def test_list(self):
        employer = Category.objects.create(name="Employer", parent=self.tabs)
        self.txn(-3000, 3, category=self.jan)
        self.txn(-41250, 1, month=9, category=employer)

        body = self.client.get(reverse("tab-list")).json()

        self.assertEqual(
            body,
            [
                {"id": employer.pk, "name": "Employer", "group_name": "Tabs", "balance_cents": 41250,
                 "open_since": "2026-09-01", "row_count": 1},
                {"id": self.jan.pk, "name": "Jan", "group_name": "Tabs", "balance_cents": 3000,
                 "open_since": "2026-10-03", "row_count": 1},
            ],
        )

    def test_list_is_empty_without_tabs(self):
        self.jan.delete()

        self.assertEqual(self.client.get(reverse("tab-list")).json(), [])

    def test_detail_rows(self):
        dinner = self.txn(-6000, 3, payee="Pizzeria")
        self.client.put(
            reverse("transaction-split", args=[dinner.pk]),
            {"parts": [{"amount_cents": -3000, "category": self.restaurants.pk},
                       {"amount_cents": -3000, "category": self.jan.pk, "notes": "Jan's half"}]},
            format="json",
        )
        repaid = self.txn(3000, 12, payee="JAN PEETERS", category=self.jan)
        part = dinner.parts.get(category=self.jan)

        body = self.client.get(reverse("tab-detail", args=[self.jan.pk])).json()

        self.assertEqual((body["balance_cents"], body["open_since"], body["row_count"]), (0, None, 2))
        self.assertEqual(
            body["rows"],
            [
                {"id": part.pk, "date": "2026-10-03", "payee": "Pizzeria", "notes": "Jan's half",
                 "amount_cents": -3000, "running_balance_cents": 3000, "split_parent": dinner.pk,
                 "parent_amount_cents": -6000},
                {"id": repaid.pk, "date": "2026-10-12", "payee": "JAN PEETERS", "notes": "",
                 "amount_cents": 3000, "running_balance_cents": 0, "split_parent": None,
                 "parent_amount_cents": None},
            ],
        )

    def test_detail_404s_for_anything_but_a_tab(self):
        for pk in (self.restaurants.pk, self.tabs.pk, 99999, "x"):
            with self.subTest(pk=pk):
                response = self.client.get(f"/api/tabs/{pk}/")
                self.assertEqual(response.status_code, 404)

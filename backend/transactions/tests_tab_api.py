from datetime import date

from django.contrib.auth import get_user_model
from households.testing import TestCase
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
                 "parent_amount_cents": -6000, "kind": "lent", "covered_category": None},
                {"id": repaid.pk, "date": "2026-10-12", "payee": "JAN PEETERS", "notes": "",
                 "amount_cents": 3000, "running_balance_cents": 0, "split_parent": None,
                 "parent_amount_cents": None, "kind": "repaid", "covered_category": None},
            ],
        )

    def test_detail_404s_for_anything_but_a_tab(self):
        for pk in (self.restaurants.pk, self.tabs.pk, 99999, "x"):
            with self.subTest(pk=pk):
                response = self.client.get(f"/api/tabs/{pk}/")
                self.assertEqual(response.status_code, 404)


class CoveredEntryApiTests(TabApiTestCase):
    """The covered entry endpoints - see "Record what the tab's person paid
    for" and "Edit and delete a covered entry" in repayment-tabs."""

    def setUp(self):
        super().setUp()
        self.takeout = Category.objects.create(name="Takeout")
        self.txn(-1000, 3, payee="Pizzeria", category=self.jan)

    def post(self, **overrides):
        body = {"date": "2026-11-11", "payee": "Sushi Palace", "amount_cents": 1500, "category": self.takeout.pk}
        return self.client.post(reverse("tab-covered-create", args=[self.jan.pk]), {**body, **overrides}, format="json")

    def entry_url(self, row_id, tab=None):
        return reverse("tab-covered-entry", args=[(tab or self.jan).pk, row_id])

    def test_record_returns_the_tab_with_the_new_row(self):
        response = self.post()

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["balance_cents"], -500)
        row = body["rows"][-1]
        self.assertEqual(body["saved_row"], row["id"])
        self.assertEqual(
            (row["payee"], row["kind"], row["amount_cents"], row["running_balance_cents"], row["covered_category"]),
            ("Sushi Palace", "covered", 1500, -500, {"id": self.takeout.pk, "label": "Takeout"}),
        )
        self.assertEqual(body["rows"][0]["kind"], "lent")

    def test_repaid_kind(self):
        self.txn(1000, 5, payee="JAN", category=self.jan)

        rows = self.client.get(reverse("tab-detail", args=[self.jan.pk])).json()["rows"]

        self.assertEqual([r["kind"] for r in rows], ["lent", "repaid"])
        self.assertIsNone(rows[1]["covered_category"])

    def test_missing_fields_say_which(self):
        for overrides, field in (({"amount_cents": 0}, "amount_cents"), ({"category": None}, "category"),
                                 ({"category": self.tabs.pk}, "category"), ({"payee": " "}, "payee")):
            with self.subTest(field=field, overrides=overrides):
                response = self.post(**overrides)
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json())

        self.assertFalse(Transaction.objects.filter(account__is_off_bank=True).exists())

    def test_unknown_tab(self):
        response = self.client.post(reverse("tab-covered-create", args=[self.restaurants.pk]), {}, format="json")

        self.assertEqual(response.status_code, 404)

    def test_change_the_amount(self):
        row_id = self.post().json()["saved_row"]

        response = self.client.patch(
            self.entry_url(row_id),
            {"date": "2026-11-11", "payee": "Sushi Palace", "amount_cents": 1200, "category": self.takeout.pk},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["balance_cents"], -200)
        cost = Transaction.objects.get(covered_tab_row_id=row_id)
        self.assertEqual(cost.amount_cents, -1200)

    def test_delete_both_halves(self):
        row_id = self.post().json()["saved_row"]

        response = self.client.delete(self.entry_url(row_id))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["balance_cents"], 1000)
        self.assertFalse(Transaction.objects.filter(account__is_off_bank=True).exists())

    def test_a_row_that_is_not_a_covered_entry_on_that_tab(self):
        row_id = self.post().json()["saved_row"]
        sarah = Category.objects.create(name="Sarah", parent=self.tabs)
        bank_row = Transaction.objects.filter(account=self.joint).first()

        for url in (self.entry_url(bank_row.pk), self.entry_url(row_id, tab=sarah)):
            with self.subTest(url=url):
                self.assertEqual(self.client.delete(url).status_code, 404)
        self.assertTrue(Transaction.objects.filter(pk=row_id).exists())


class CoveredEntryStaysATabTests(TabApiTestCase):
    """"A tab with covered entries stays a tab" in repayment-tabs."""

    def setUp(self):
        super().setUp()
        self.takeout = Category.objects.create(name="Takeout")
        self.gifts = Category.objects.create(name="Gifts")
        response = self.client.post(
            reverse("tab-covered-create", args=[self.jan.pk]),
            {"date": "2026-11-11", "payee": "Sushi Palace", "amount_cents": 1500, "category": self.takeout.pk},
            format="json",
        )
        self.tab_half = Transaction.objects.get(pk=response.json()["saved_row"])
        self.cost = self.tab_half.covered_cost

    def test_moving_it_out_is_refused(self):
        response = self.client.patch(
            reverse("category-detail", args=[self.jan.pk]), {"parent": self.gifts.pk}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("covered entries", response.json()["parent"][0])
        self.jan.refresh_from_db()
        self.assertEqual(self.jan.parent, self.tabs)

    def test_moving_it_to_top_level_is_refused(self):
        response = self.client.patch(reverse("category-detail", args=[self.jan.pk]), {"parent": None}, format="json")

        self.assertEqual(response.status_code, 400)

    def test_moving_it_to_another_tab_group_is_fine(self):
        friends = Category.objects.create(name="Friends", is_tab_group=True)

        response = self.client.patch(
            reverse("category-detail", args=[self.jan.pk]), {"parent": friends.pk}, format="json"
        )

        self.assertEqual(response.status_code, 200)

    def test_turning_off_the_tab_group_is_refused(self):
        response = self.client.patch(
            reverse("category-detail", args=[self.tabs.pk]), {"is_tab_group": False}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.tabs.refresh_from_db()
        self.assertTrue(self.tabs.is_tab_group)

    def test_the_halves_are_out_of_reach_of_transaction_endpoints(self):
        for row in (self.tab_half, self.cost):
            with self.subTest(row=row.amount_cents):
                detail = reverse("transaction-detail", args=[row.pk])
                self.assertEqual(
                    self.client.patch(detail, {"category": self.restaurants.pk}, format="json").status_code, 404
                )
                self.assertEqual(self.client.delete(detail).status_code, 404)
                self.assertEqual(
                    self.client.put(reverse("transaction-split", args=[row.pk]), {"parts": []}, format="json")
                    .status_code, 404,
                )
                self.assertEqual(
                    self.client.post(reverse("transaction-transfer", args=[row.pk]), {"account": self.joint.pk},
                                     format="json").status_code, 404,
                )
        self.tab_half.refresh_from_db()
        self.cost.refresh_from_db()
        self.assertEqual((self.tab_half.category, self.cost.category), (self.jan, self.takeout))

    def test_bulk_categorize_skips_them(self):
        self.client.post(
            reverse("transaction-confirm-categories"),
            {"ids": [self.tab_half.pk, self.cost.pk], "category": self.restaurants.pk},
            format="json",
        )

        self.tab_half.refresh_from_db()
        self.cost.refresh_from_db()
        self.assertEqual((self.tab_half.category, self.cost.category), (self.jan, self.takeout))

    def test_deleting_the_tab_is_refused(self):
        response = self.client.delete(reverse("category-detail", args=[self.jan.pk]))

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Category.objects.filter(pk=self.jan.pk).exists())

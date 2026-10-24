from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category

from .models import Transaction
from .transfers import link_transfer


class SplitApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="u", password="x"))
        self.checking = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)
        self.savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        self.restaurants = Category.objects.create(name="Restaurants")
        self.gifts = Category.objects.create(name="Gifts")
        self.dinner = Transaction.objects.create(
            account=self.checking, date=date(2026, 3, 3), amount_cents=-6000, payee="Pizzeria"
        )

    def split_url(self, txn=None):
        return reverse("transaction-split", args=[(txn or self.dinner).pk])

    def detail_url(self, txn):
        return reverse("transaction-detail", args=[txn.pk])

    def put_split(self, parts, txn=None):
        return self.client.put(self.split_url(txn), {"parts": parts}, format="json")

    def split_in_two(self):
        response = self.put_split(
            [
                {"amount_cents": -3000, "category": self.restaurants.pk, "notes": "my half"},
                {"amount_cents": -3000, "transfer_account": self.savings.pk},
            ]
        )
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()

    def part(self, index):
        return Transaction.objects.filter(split_parent=self.dinner).order_by("pk")[index]

    # --- PUT / DELETE .../split/ ---

    def test_put_returns_the_transaction_with_its_parts(self):
        body = self.split_in_two()

        self.assertIsNone(body["category"])
        self.assertIsNone(body["split_parent"])
        first, second = body["parts"]
        self.assertEqual(
            (first["amount_cents"], first["category"], first["notes"], first["transfer"]),
            (-3000, self.restaurants.pk, "my half", None),
        )
        self.assertEqual(second["transfer"]["account_name"], "Savings")
        self.assertTrue(second["transfer"]["created_by_transfer"])

    def test_put_edits_by_id(self):
        body = self.split_in_two()
        first, second = body["parts"]

        response = self.put_split(
            [
                {"id": first["id"], "amount_cents": -4000, "category": self.gifts.pk},
                {"id": second["id"], "amount_cents": -2000, "transfer_account": self.savings.pk},
            ]
        )

        parts = response.json()["parts"]
        self.assertEqual([p["id"] for p in parts], [first["id"], second["id"]])
        self.assertEqual([p["amount_cents"] for p in parts], [-4000, -2000])

    def test_put_errors_name_their_line(self):
        cases = [
            ([{"amount_cents": -3000}, {"amount_cents": -2000}], None),
            ([{"amount_cents": -7000}, {"amount_cents": 1000}], 1),
            ([{"amount_cents": -3000}, {"amount_cents": -3000, "category": 99999}], 1),
            ([{"amount_cents": -3000}, {"amount_cents": -3000, "transfer_account": self.checking.pk}], 1),
            ([{"amount_cents": -3000, "id": 99999}, {"amount_cents": -3000}], 0),
        ]
        for parts, line in cases:
            with self.subTest(parts=parts):
                response = self.put_split(parts)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["line"], line)
                self.assertTrue(response.json()["detail"])
        self.assertFalse(Transaction.objects.filter(split_parent=self.dinner).exists())

    def test_put_without_a_parts_list_is_rejected(self):
        response = self.client.put(self.split_url(), {}, format="json")

        self.assertEqual(response.status_code, 400)

    def test_put_on_a_transfer_or_a_part_is_rejected(self):
        self.split_in_two()
        transfer = Transaction.objects.create(
            account=self.checking, date=date(2026, 3, 3), amount_cents=-500, payee="to savings"
        )
        link_transfer(transfer, self.savings)
        parts = [{"amount_cents": -250}, {"amount_cents": -250}]

        self.assertEqual(self.put_split(parts, txn=transfer).status_code, 400)
        self.assertEqual(self.put_split([{"amount_cents": -1500}, {"amount_cents": -1500}], txn=self.part(0)).status_code, 400)

    def test_delete_unsplits(self):
        self.split_in_two()

        response = self.client.delete(self.split_url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["parts"], [])
        self.assertIsNone(response.json()["category"])

    def test_delete_keeps_a_category_or_transfer(self):
        self.split_in_two()
        response = self.client.delete(self.split_url(), {"category": self.restaurants.pk}, format="json")
        self.assertEqual(response.json()["category"], self.restaurants.pk)

        self.split_in_two()
        response = self.client.delete(self.split_url(), {"transfer_account": self.savings.pk}, format="json")
        self.assertEqual(response.json()["transfer"]["account_name"], "Savings")

    def test_delete_on_an_unsplit_transaction_is_rejected(self):
        self.assertEqual(self.client.delete(self.split_url()).status_code, 400)

    def test_deleting_a_split_transaction_deletes_its_parts(self):
        self.split_in_two()

        response = self.client.delete(self.detail_url(self.dinner))

        self.assertEqual(response.status_code, 204)
        self.assertEqual(Transaction.objects.count(), 0)

    def test_a_part_cant_be_deleted(self):
        self.split_in_two()

        response = self.client.delete(self.detail_url(self.part(0)))

        self.assertEqual(response.status_code, 400)
        self.assertEqual(Transaction.objects.filter(split_parent=self.dinner).count(), 2)

    # --- guards on PATCH and transfer ---

    def patch(self, txn, data):
        return self.client.patch(self.detail_url(txn), data, format="json")

    def test_a_split_transaction_cant_get_a_category_or_a_new_amount(self):
        self.split_in_two()

        self.assertEqual(self.patch(self.dinner, {"category": self.gifts.pk}).status_code, 400)
        response = self.patch(self.dinner, {"amount_cents": -7000})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsplit", response.json()["amount_cents"][0])
        # The form sends the unchanged amount along: that's fine.
        self.assertEqual(self.patch(self.dinner, {"amount_cents": -6000, "notes": "x"}).status_code, 200)

    def test_a_split_transaction_cant_become_a_transfer(self):
        self.split_in_two()

        response = self.client.post(
            reverse("transaction-transfer", args=[self.dinner.pk]), {"account": self.savings.pk}, format="json"
        )

        self.assertEqual(response.status_code, 400)

    def test_date_and_payee_changes_reach_the_parts(self):
        self.split_in_two()

        response = self.patch(self.dinner, {"date": "2026-03-04", "payee": "Pizzeria Napoli"})

        self.assertEqual(response.status_code, 200)
        for part in Transaction.objects.filter(split_parent=self.dinner):
            self.assertEqual((part.date, part.payee), (date(2026, 3, 4), "Pizzeria Napoli"))
        created = self.part(1).transfer_counterpart
        self.assertEqual(created.date, date(2026, 3, 4))

    def test_a_parts_amount_date_and_payee_are_locked(self):
        self.split_in_two()
        part = self.part(0)

        for data in ({"amount_cents": -1}, {"date": "2026-03-09"}, {"payee": "other"}):
            with self.subTest(data=data):
                self.assertEqual(self.patch(part, data).status_code, 400)

    def test_recategorize_a_part(self):
        self.split_in_two()

        response = self.patch(self.part(0), {"category": self.gifts.pk, "notes": "gift"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["split_parent"], self.dinner.pk)
        self.assertIsNone(response.json()["parts"])
        part = self.part(0)
        self.assertEqual((part.category, part.notes), (self.gifts, "gift"))

    def test_a_part_becomes_a_transfer_and_back(self):
        self.split_in_two()
        part = self.part(0)

        response = self.client.post(
            reverse("transaction-transfer", args=[part.pk]), {"account": self.savings.pk}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["counterpart"]["amount_cents"], 3000)

        self.assertEqual(self.patch(part, {"category": self.gifts.pk}).status_code, 200)
        self.assertIsNone(Transaction.objects.get(pk=part.pk).transfer_counterpart)

    # --- listing ---

    def list(self, **params):
        return self.client.get(reverse("transaction-list"), {"account": self.checking.pk, **params}).json()

    def test_parts_are_listed_only_inside_their_transaction(self):
        self.split_in_two()

        rows = self.list()

        self.assertEqual([r["id"] for r in rows], [self.dinner.pk])
        self.assertEqual(len(rows[0]["parts"]), 2)

    def test_filter_finds_a_split_through_a_part(self):
        self.split_in_two()
        Transaction.objects.create(
            account=self.checking, date=date(2026, 3, 4), amount_cents=-100, payee="Bistro", category=self.restaurants
        )

        rows = self.list(category=self.restaurants.pk)

        self.assertEqual(sorted(r["payee"] for r in rows), ["Bistro", "Pizzeria"])
        pizzeria = next(r for r in rows if r["payee"] == "Pizzeria")
        self.assertEqual(len(pizzeria["parts"]), 2)

    def test_search_matches_part_notes(self):
        self.split_in_two()

        self.assertEqual([r["id"] for r in self.list(search="my half")], [self.dinner.pk])

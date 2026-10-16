from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category

from .models import Transaction


class TransferApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="u", password="x"))
        self.checking = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)
        self.savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        self.out = Transaction.objects.create(
            account=self.checking, date=date(2026, 3, 3), amount_cents=-50000, payee="to savings"
        )

    def transfer_url(self, txn):
        return reverse("transaction-transfer", args=[txn.pk])

    def detail_url(self, txn):
        return reverse("transaction-detail", args=[txn.pk])

    def link(self, account=None):
        return self.client.post(self.transfer_url(self.out), {"account": (account or self.savings).pk}, format="json")

    def test_post_links_and_returns_both_sides_with_the_transfer_field(self):
        response = self.link()

        self.assertEqual(response.status_code, 200)
        body = response.json()
        counterpart = body["counterpart"]
        self.assertEqual(
            body["transaction"]["transfer"],
            {"counterpart_id": counterpart["id"], "account_id": self.savings.pk, "account_name": "Savings"},
        )
        self.assertEqual(counterpart["transfer"]["account_name"], "Checking")
        self.assertEqual(counterpart["amount_cents"], 50000)

    def test_list_shows_the_transfer_field_and_null_for_normal_transactions(self):
        Transaction.objects.create(account=self.checking, date=date(2026, 3, 4), amount_cents=-100, payee="normal")
        self.link()

        rows = self.client.get(reverse("transaction-list"), {"account": self.checking.pk}).json()

        transfers = {r["payee"]: r["transfer"] for r in rows}
        self.assertIsNone(transfers["normal"])
        self.assertEqual(transfers["to savings"]["account_name"], "Savings")

    def test_post_rejects_same_unknown_and_archived_accounts(self):
        archived = Account.objects.create(name="Old", account_type="savings", starting_balance_cents=0, archived=True)
        for account_id in (self.checking.pk, 99999, archived.pk):
            response = self.client.post(self.transfer_url(self.out), {"account": account_id}, format="json")
            self.assertEqual(response.status_code, 400, account_id)
        self.assertEqual(Transaction.objects.count(), 1)

    def test_delete_unlinks_and_removes_a_created_counterpart(self):
        counterpart_id = self.link().json()["counterpart"]["id"]

        response = self.client.delete(self.transfer_url(self.out))

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["transaction"]["transfer"])
        self.assertFalse(Transaction.objects.filter(pk=counterpart_id).exists())

    def test_patching_a_category_unlinks_the_transfer(self):
        counterpart_id = self.link().json()["counterpart"]["id"]

        response = self.client.patch(self.detail_url(self.out), {"category": self.groceries.pk}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["category"], self.groceries.pk)
        self.assertIsNone(response.json()["transfer"])
        self.assertFalse(Transaction.objects.filter(pk=counterpart_id).exists())

    def test_patching_category_null_also_unlinks(self):
        self.link()
        response = self.client.patch(self.detail_url(self.out), {"category": None}, format="json")
        self.assertIsNone(response.json()["transfer"])

    def test_patching_amount_mirrors_to_a_created_counterpart(self):
        counterpart_id = self.link().json()["counterpart"]["id"]

        self.client.patch(self.detail_url(self.out), {"amount_cents": -55000, "date": "2026-03-06"}, format="json")

        counterpart = Transaction.objects.get(pk=counterpart_id)
        self.assertEqual((counterpart.amount_cents, counterpart.date), (55000, date(2026, 3, 6)))
        self.assertEqual(Transaction.objects.get(pk=self.out.pk).transfer_counterpart_id, counterpart_id)

    def test_patching_notes_keeps_the_link(self):
        self.link()
        response = self.client.patch(self.detail_url(self.out), {"notes": "monthly saving"}, format="json")
        self.assertEqual(response.json()["transfer"]["account_name"], "Savings")

    def test_deleting_a_side_removes_a_created_counterpart(self):
        counterpart_id = self.link().json()["counterpart"]["id"]

        response = self.client.delete(self.detail_url(self.out))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Transaction.objects.filter(pk=counterpart_id).exists())

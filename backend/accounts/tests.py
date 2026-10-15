from unittest.mock import PropertyMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from transactions.models import Transaction

from .models import Account


class AccountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(
            username="budgeter", password="irrelevant-for-this-test"
        )
        self.client.force_authenticate(user=user)

    def test_create_account_succeeds(self):
        response = self.client.post(
            reverse("account-list"),
            {
                "name": "Main Checking",
                "account_type": "checking",
                "starting_balance_cents": 100000,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["current_balance_cents"], 100000)

    def test_create_account_without_name_is_rejected(self):
        response = self.client.post(
            reverse("account-list"),
            {"account_type": "checking", "starting_balance_cents": 100000},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Account.objects.count(), 0)

    def test_new_account_balance_equals_starting_balance(self):
        account = Account.objects.create(
            name="Savings", account_type="savings", starting_balance_cents=50000
        )
        response = self.client.get(reverse("account-detail", args=[account.id]))
        self.assertEqual(response.json()["current_balance_cents"], 50000)

    def test_rename_account(self):
        account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=0
        )
        response = self.client.patch(
            reverse("account-detail", args=[account.id]),
            {"name": "Everyday Checking"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        account.refresh_from_db()
        self.assertEqual(account.name, "Everyday Checking")

    def test_edit_starting_balance_before_any_transactions_succeeds(self):
        account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=100000
        )
        response = self.client.patch(
            reverse("account-detail", args=[account.id]),
            {"starting_balance_cents": 120000},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["current_balance_cents"], 120000)

    def test_edit_starting_balance_blocked_once_account_has_transactions(self):
        # The real `transactions` app doesn't exist until task 3.x, so this
        # exercises the rule via a mock. Task 3.2 should add a true
        # integration test (create a real transaction, then attempt the
        # edit) once the Transaction model exists - see tasks.md.
        account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=100000
        )
        with patch.object(
            Account, "has_transactions", new_callable=PropertyMock, return_value=True
        ):
            response = self.client.patch(
                reverse("account-detail", args=[account.id]),
                {"starting_balance_cents": 999},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        account.refresh_from_db()
        self.assertEqual(account.starting_balance_cents, 100000)

    def test_edit_starting_balance_blocked_once_account_has_a_real_transaction(self):
        # The integration-level version of the test above, promised in
        # tasks.md 3.2 now that the real Transaction model exists.
        account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=100000
        )
        Transaction.objects.create(account=account, date="2026-01-01", amount_cents=-500, payee="Coffee")

        response = self.client.patch(
            reverse("account-detail", args=[account.id]),
            {"starting_balance_cents": 999},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        account.refresh_from_db()
        self.assertEqual(account.starting_balance_cents, 100000)

    def test_balance_includes_transactions(self):
        account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=100000
        )
        Transaction.objects.create(account=account, date="2026-01-01", amount_cents=-4250, payee="Groceries")
        Transaction.objects.create(account=account, date="2026-01-02", amount_cents=20000, payee="Paycheck")

        response = self.client.get(reverse("account-detail", args=[account.id]))
        self.assertEqual(response.json()["current_balance_cents"], 100000 - 4250 + 20000)

    def test_archive_hides_account_from_default_list_but_detail_still_works(self):
        account = Account.objects.create(
            name="Old Credit Card", account_type="credit_card", starting_balance_cents=-5000
        )
        archive_response = self.client.post(reverse("account-archive", args=[account.id]))
        self.assertEqual(archive_response.status_code, 200)

        list_response = self.client.get(reverse("account-list"))
        ids = [row["id"] for row in list_response.json()]
        self.assertNotIn(account.id, ids)

        detail_response = self.client.get(reverse("account-detail", args=[account.id]))
        self.assertEqual(detail_response.status_code, 200)
        self.assertTrue(detail_response.json()["archived"])

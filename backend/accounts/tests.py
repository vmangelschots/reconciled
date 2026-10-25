from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from transactions.models import Transaction
from transactions.splits import SplitLine, save_split

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

    def test_edit_starting_balance_after_transactions_exist_succeeds(self):
        account = Account.objects.create(
            name="Main Checking", account_type="checking", starting_balance_cents=100000
        )
        transaction = Transaction.objects.create(
            account=account, date="2026-01-01", amount_cents=-30000, payee="Rent"
        )

        response = self.client.patch(
            reverse("account-detail", args=[account.id]),
            {"starting_balance_cents": 120000},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["current_balance_cents"], 90000)
        transaction.refresh_from_db()
        self.assertEqual(transaction.amount_cents, -30000)
        self.assertEqual(transaction.account_id, account.id)

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

    def test_splitting_does_not_change_the_balance(self):
        account = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=100000)
        dinner = Transaction.objects.create(account=account, date="2026-03-03", amount_cents=-6000, payee="Pizzeria")
        save_split(dinner, [SplitLine(-3000), SplitLine(-3000)])

        rows = self.client.get(reverse("account-list")).json()

        self.assertEqual(rows[0]["current_balance_cents"], 94000)


class AccountTierTests(TestCase):
    """The accounts spec's "Account tiers" and "Accounts are listed by tier"."""

    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="irrelevant-for-this-test")
        self.client.force_authenticate(user=user)

    def test_create_a_mortgage(self):
        response = self.client.post(
            reverse("account-list"),
            {"name": "Mortgage", "account_type": "loan", "starting_balance_cents": -25000000},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["current_balance_cents"], -25000000)
        self.assertEqual(response.json()["tier"], "loans")

    def test_tier_follows_the_type(self):
        response = self.client.post(
            reverse("account-list"),
            {"name": "Funds", "account_type": "investment", "starting_balance_cents": 0},
            format="json",
        )
        self.assertEqual(response.json()["tier"], "investments")

    def test_changing_the_type_moves_the_tier(self):
        account = Account.objects.create(name="Revolut Pockets", account_type="savings", starting_balance_cents=0)
        self.assertEqual(account.tier, "savings")
        response = self.client.patch(
            reverse("account-detail", args=[account.id]), {"account_type": "checking"}, format="json"
        )
        self.assertEqual(response.json()["tier"], "everyday")

    def test_a_house_after_everyday_accounts(self):
        for name, account_type in [
            ("House", "property"),
            ("Crelan", "checking"),
            ("Spaarrekening", "savings"),
            ("Revolut", "checking"),
        ]:
            Account.objects.create(name=name, account_type=account_type, starting_balance_cents=0)
        names = [a["name"] for a in self.client.get(reverse("account-list")).json()]
        self.assertEqual(names, ["Crelan", "Revolut", "Spaarrekening", "House"])

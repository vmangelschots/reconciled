from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account
from budgets.models import Category

from .models import Transaction
from .transfers import link_transfer

HISTORY = Transaction.CategorySource.HISTORY


class ReviewApiTests(TestCase):
    """The Review page's endpoints - see openspec/specs/auto-categorization."""

    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(username="budgeter", password="x")
        self.client.force_authenticate(user=user)
        self.checking = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)
        self.joint = Account.objects.create(name="Joint", account_type="checking", starting_balance_cents=0)
        self.savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        self.household = Category.objects.create(name="Household")
        self.transport = Category.objects.create(name="Transport")

    def txn(self, payee, amount_cents=-1000, day=1, account=None, category=None, guessed=False):
        return Transaction.objects.create(
            account=account or self.checking,
            date=f"2026-10-{day:02d}",
            amount_cents=amount_cents,
            payee=payee,
            category=category,
            category_confirmed=not guessed,
            category_source=HISTORY if guessed else Transaction.CategorySource.MANUAL,
        )

    def groups(self):
        response = self.client.get(reverse("transaction-review-groups"))
        self.assertEqual(response.status_code, 200)
        return response.json()

    # --- review-groups ---

    def test_groups_split_by_payee_and_guess_ordered_by_count(self):
        # History: 7 of 8 Carrefour outflows were Groceries.
        for day in range(1, 8):
            self.txn("CARREFOUR MARKET 1234", day=day, category=self.groceries)
        self.txn("CARREFOUR MARKET 1234", day=8, category=self.household)
        for day in (10, 11, 12, 13):
            self.txn("NMBS 551", day=day, category=self.transport, guessed=True)
        for day, account in ((14, self.checking), (16, self.joint), (21, self.checking)):
            self.txn(f"Carrefour Market {day:04d}", day=day, account=account, category=self.groceries, guessed=True)
        self.txn("Carrefour Market 0001", day=22, category=self.household, guessed=True)

        groups = self.groups()["groups"]

        self.assertEqual([(g["count"], g["category"]) for g in groups], [
            (4, self.transport.id), (3, self.groceries.id), (1, self.household.id),
        ])
        carrefour = groups[1]
        self.assertEqual(carrefour["payee"], "Carrefour Market 0021")
        self.assertEqual(carrefour["direction"], "out")
        self.assertEqual(carrefour["source"], "history")
        self.assertEqual(carrefour["total_cents"], -3000)
        self.assertEqual((carrefour["date_from"], carrefour["date_to"]), ("2026-10-14", "2026-10-21"))
        self.assertEqual(carrefour["accounts"], ["Checking", "Joint"])
        self.assertEqual(carrefour["evidence"], {"matching": 7, "total": 8})
        self.assertEqual(len(carrefour["transactions"]), 3)
        self.assertEqual(
            set(carrefour["transactions"][0]), {"id", "date", "account", "payee", "amount_cents", "notes"}
        )
        self.assertEqual(groups[2]["evidence"], {"matching": 1, "total": 8})

    def test_direction_splits_groups(self):
        self.txn("Carrefour", category=self.groceries, guessed=True)
        self.txn("Carrefour", amount_cents=500, category=self.groceries, guessed=True)

        self.assertEqual(sorted(g["direction"] for g in self.groups()["groups"]), ["in", "out"])

    def test_confirmed_rows_are_not_listed(self):
        self.txn("Carrefour", category=self.groceries)
        self.txn("Shop")

        self.assertEqual(self.groups()["groups"], [])

    def test_uncategorized_count_excludes_transfers(self):
        self.txn("Shop")
        self.txn("Bakery")
        transfer = self.txn("To savings")
        link_transfer(transfer, self.savings)  # also creates an uncategorized counterpart

        self.assertEqual(self.groups()["uncategorized_count"], 2)

    # --- review-count ---

    def test_review_count_matches_the_unconfirmed_rows(self):
        self.txn("Carrefour", category=self.groceries, guessed=True)
        self.txn("NMBS", category=self.transport, guessed=True)
        self.txn("Bakery", category=self.groceries)
        self.txn("Shop")

        response = self.client.get(reverse("transaction-review-count"))
        self.assertEqual(response.json(), {"count": 2})

    # --- confirm-categories ---

    def confirm(self, data):
        return self.client.post(reverse("transaction-confirm-categories"), data, format="json")

    def test_confirm_without_category_only_confirms_guesses_among_the_ids(self):
        guess = self.txn("Carrefour", category=self.groceries, guessed=True)
        other_guess = self.txn("NMBS", category=self.transport, guessed=True)
        already = self.txn("Bakery", category=self.groceries)
        empty = self.txn("Shop")

        response = self.confirm({"ids": [guess.id, already.id, empty.id]})

        self.assertEqual(response.json(), {"confirmed_count": 1})
        guess.refresh_from_db()
        other_guess.refresh_from_db()
        self.assertTrue(guess.category_confirmed)
        self.assertEqual(guess.category_source, "history")
        self.assertFalse(other_guess.category_confirmed)

    def test_confirm_with_a_category_sets_and_confirms_it(self):
        a = self.txn("Carrefour", category=self.groceries, guessed=True)
        b = self.txn("Carrefour", day=2, category=self.groceries, guessed=True)
        untouched = self.txn("Carrefour", day=3, category=self.groceries, guessed=True)

        response = self.confirm({"ids": [a.id, b.id], "category": self.household.id})

        self.assertEqual(response.json(), {"confirmed_count": 2})
        for txn in (a, b):
            txn.refresh_from_db()
            self.assertEqual(txn.category, self.household)
            self.assertTrue(txn.category_confirmed)
            self.assertEqual(txn.category_source, "manual")
        untouched.refresh_from_db()
        self.assertFalse(untouched.category_confirmed)

    def test_confirm_with_the_guessed_category_keeps_the_source(self):
        guess = self.txn("Carrefour", category=self.groceries, guessed=True)

        self.confirm({"ids": [guess.id], "category": self.groceries.id})

        guess.refresh_from_db()
        self.assertTrue(guess.category_confirmed)
        self.assertEqual(guess.category_source, "history")

    def test_confirm_rejects_bad_input(self):
        self.assertEqual(self.confirm({}).status_code, 400)
        self.assertEqual(self.confirm({"ids": "1,2"}).status_code, 400)
        self.assertEqual(self.confirm({"ids": [1], "category": 99999}).status_code, 400)

    # --- categorize ---

    def test_categorize_backfills_across_accounts(self):
        # 25 of 40 uncategorized rows have a payee with confirmed history.
        self.txn("Carrefour", category=self.groceries)
        self.txn("NMBS", category=self.transport)
        for i in range(25):
            self.txn("Carrefour" if i % 2 else "NMBS", day=10, account=self.joint if i % 3 else self.checking)
        for i in range(15):
            self.txn(f"Unknown shop {chr(97 + i)}", day=11)
        guessed = self.txn("Carrefour", day=12, category=self.household, guessed=True)
        transfer = self.txn("Carrefour", day=13)
        link_transfer(transfer, self.savings)

        response = self.client.post(reverse("transaction-categorize"), {}, format="json")

        # The transfer's created counterpart is excluded; the guessed row
        # and the transfer keep what they had.
        self.assertEqual(response.json(), {"categorized_count": 25, "attempted_count": 40})
        guessed.refresh_from_db()
        transfer.refresh_from_db()
        self.assertEqual(guessed.category, self.household)
        self.assertIsNone(transfer.category)

    def test_categorize_can_be_limited_to_one_account(self):
        self.txn("Carrefour", category=self.groceries)
        self.txn("Carrefour", day=10, account=self.joint)
        self.txn("Carrefour", day=11)

        response = self.client.post(reverse("transaction-categorize"), {"account": self.joint.id}, format="json")

        self.assertEqual(response.json(), {"categorized_count": 1, "attempted_count": 1})

    def test_categorize_rejects_an_unknown_account(self):
        response = self.client.post(reverse("transaction-categorize"), {"account": 99999}, format="json")
        self.assertEqual(response.status_code, 400)

    # --- serializer fields ---

    def test_list_includes_the_confirmation_fields(self):
        self.txn("Carrefour", category=self.groceries, guessed=True)

        row = self.client.get(reverse("transaction-list")).json()[0]
        self.assertEqual((row["category_confirmed"], row["category_source"]), (False, "history"))

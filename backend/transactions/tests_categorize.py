from datetime import date

from django.test import TestCase

from accounts.models import Account
from budgets.models import Category

from .categorize import categorize, normalize_payee
from .models import Transaction
from .transfers import link_transfer


class NormalizePayeeTests(TestCase):
    def test_strips_case_digits_punctuation_and_whitespace(self):
        self.assertEqual(normalize_payee("CARREFOUR MARKET 1234 BXL 23/10"), "carrefour market bxl")
        self.assertEqual(normalize_payee("  Carrefour   Market-0987 "), "carrefour market")

    def test_keeps_accented_letters(self):
        self.assertEqual(normalize_payee("Café Lumière 12"), "café lumière")

    def test_digits_only_payee_normalizes_to_empty(self):
        self.assertEqual(normalize_payee("0000123 / 45"), "")


class CategorizeTests(TestCase):
    """Every guessing scenario in openspec/specs/auto-categorization."""

    def setUp(self):
        self.checking = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)
        self.joint = Account.objects.create(name="Joint", account_type="checking", starting_balance_cents=0)
        self.savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        self.household = Category.objects.create(name="Household")
        self.transport = Category.objects.create(name="Transport")

    def txn(self, payee, amount_cents=-1000, day=1, account=None, category=None, confirmed=True):
        return Transaction.objects.create(
            account=account or self.checking,
            date=date(2026, 10, day),
            amount_cents=amount_cents,
            payee=payee,
            category=category,
            category_confirmed=confirmed,
        )

    def categorized(self, txn):
        categorize([txn])
        return Transaction.objects.get(pk=txn.pk)

    def test_repeat_payee_gets_its_usual_category_across_noise(self):
        for day in (1, 2, 3):
            self.txn("CARREFOUR MARKET 1234", day=day, category=self.groceries)
        new = self.txn("Carrefour Market 0987", day=20)

        self.assertEqual(self.categorized(new).category, self.groceries)

    def test_history_on_any_account_counts(self):
        self.txn("NMBS 551", account=self.joint, category=self.transport)
        new = self.txn("NMBS 909", day=20)

        self.assertEqual(self.categorized(new).category, self.transport)

    def test_most_frequent_category_wins(self):
        for day in (1, 2, 3, 4):
            self.txn("Carrefour", day=day, category=self.groceries)
        self.txn("Carrefour", day=5, category=self.household)
        new = self.txn("Carrefour", day=20)

        self.assertEqual(self.categorized(new).category, self.groceries)

    def test_a_tie_goes_to_the_most_recent_category(self):
        self.txn("Carrefour", day=1, category=self.groceries)
        self.txn("Carrefour", day=2, category=self.household)
        self.txn("Carrefour", day=3, category=self.groceries)
        self.txn("Carrefour", day=4, category=self.household)
        new = self.txn("Carrefour", day=20)

        self.assertEqual(self.categorized(new).category, self.household)

    def test_inflows_and_outflows_are_matched_separately(self):
        self.txn("Carrefour", amount_cents=-2000, category=self.groceries)
        refund = self.txn("Carrefour", amount_cents=500, day=20)

        self.assertIsNone(self.categorized(refund).category)

    def test_unknown_payee_stays_uncategorized(self):
        self.txn("Carrefour", category=self.groceries)
        new = self.txn("Bistro Lumiere", day=20)

        self.assertEqual(categorize([new]), 0)
        self.assertIsNone(Transaction.objects.get(pk=new.pk).category)

    def test_digits_only_payees_never_match_each_other(self):
        self.txn("12345", category=self.groceries)
        new = self.txn("67890", day=20)

        self.assertIsNone(self.categorized(new).category)

    def test_an_unconfirmed_category_does_not_count_as_history(self):
        self.txn("Bistro", category=self.groceries, confirmed=False)
        new = self.txn("Bistro", day=20)

        self.assertIsNone(self.categorized(new).category)

    def test_an_existing_category_is_kept(self):
        self.txn("Carrefour", category=self.groceries)
        guessed = self.txn("Carrefour", day=20, category=self.transport, confirmed=False)

        self.assertEqual(categorize([guessed]), 0)
        guessed.refresh_from_db()
        self.assertEqual(guessed.category, self.transport)
        self.assertFalse(guessed.category_confirmed)

    def test_transfers_are_skipped(self):
        self.txn("Transfer to Savings", category=self.household)
        transfer = self.txn("Transfer to Savings", day=20)
        link_transfer(transfer, self.savings)
        transfer.refresh_from_db()

        self.assertEqual(categorize([transfer]), 0)
        transfer.refresh_from_db()
        self.assertIsNone(transfer.category)
        self.assertIsNotNone(transfer.transfer_counterpart)

    def test_a_guess_is_unconfirmed_with_source_history(self):
        self.txn("Carrefour", category=self.groceries)
        new = self.categorized(self.txn("Carrefour", day=20))

        self.assertEqual(new.category, self.groceries)
        self.assertFalse(new.category_confirmed)
        self.assertEqual(new.category_source, "history")

    def test_returns_the_number_categorized_and_uses_one_history_query(self):
        self.txn("Carrefour", category=self.groceries)
        self.txn("NMBS", category=self.transport)
        new = [self.txn("Carrefour", day=20), self.txn("NMBS", day=21), self.txn("Unknown", day=22)]

        # One history read plus one bulk update, however many candidates.
        with self.assertNumQueries(2):
            self.assertEqual(categorize(new), 2)

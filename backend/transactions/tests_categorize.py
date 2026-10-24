from dataclasses import fields
from datetime import date
from unittest import mock

from django.test import TestCase, override_settings

from accounts.models import Account
from budgets.models import Category

from .ai import Guess, PayeeQuestion
from .categorize import categorize, normalize_payee, uncategorized
from .models import Transaction
from .splits import SplitLine, save_split
from .transfers import link_transfer


class NormalizePayeeTests(TestCase):
    def test_strips_case_digits_punctuation_and_whitespace(self):
        self.assertEqual(normalize_payee("CARREFOUR MARKET 1234 BXL 23/10"), "carrefour market bxl")
        self.assertEqual(normalize_payee("  Carrefour   Market-0987 "), "carrefour market")

    def test_keeps_accented_letters(self):
        self.assertEqual(normalize_payee("Café Lumière 12"), "café lumière")

    def test_digits_only_payee_normalizes_to_empty(self):
        self.assertEqual(normalize_payee("0000123 / 45"), "")


@override_settings(OPENAI_API_KEY="")
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

    def test_parts_are_not_history(self):
        dinner = self.txn("PIZZERIA NAPOLI", amount_cents=-6000)
        save_split(dinner, [SplitLine(-3000, category=self.groceries), SplitLine(-3000)])
        new = self.txn("Pizzeria Napoli", day=20)

        self.assertIsNone(self.categorized(new).category)

    def test_splits_are_skipped_and_not_counted_as_uncategorized(self):
        self.txn("CARREFOUR", category=self.groceries)
        shop = self.txn("CARREFOUR", amount_cents=-6000, day=2)
        save_split(shop, [SplitLine(-3000, category=self.household), SplitLine(-3000)])
        parts = list(Transaction.objects.filter(split_parent=shop))

        self.assertEqual(list(uncategorized()), [])
        categorize([shop, *parts, *uncategorized()])

        self.assertIsNone(Transaction.objects.get(pk=shop.pk).category)
        self.assertEqual(
            sorted((p.category_id or 0) for p in Transaction.objects.filter(split_parent=shop)),
            sorted([self.household.pk, 0]),
        )

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

        self.assertEqual(categorize([new]).categorized, 0)
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

        self.assertEqual(categorize([guessed]).categorized, 0)
        guessed.refresh_from_db()
        self.assertEqual(guessed.category, self.transport)
        self.assertFalse(guessed.category_confirmed)

    def test_transfers_are_skipped(self):
        self.txn("Transfer to Savings", category=self.household)
        transfer = self.txn("Transfer to Savings", day=20)
        link_transfer(transfer, self.savings)
        transfer.refresh_from_db()

        self.assertEqual(categorize([transfer]).categorized, 0)
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

        # One split check, one history read and one bulk update, however
        # many candidates.
        with self.assertNumQueries(3):
            self.assertEqual(categorize(new).categorized, 2)

    def test_without_a_key_only_history_runs(self):
        self.txn("Carrefour", category=self.groceries)
        result = categorize([self.txn("Carrefour", day=20), self.txn("Bistro Lumiere", day=21)])

        self.assertEqual((result.history, result.ai, result.ai_status), (1, 0, "off"))


class FakeGuesser:
    """Answers from a {payee: (category, reason)} table, None to decline;
    records the questions it was asked."""

    def __init__(self, answers=None, status="ok", error=None):
        self.answers = answers or {}
        self.status = status
        self.error = error
        self.questions = []
        self.categories = None

    def guess(self, questions, categories, deadline):
        self.questions.extend(questions)
        self.categories = categories
        if self.error:
            raise self.error
        guesses = {}
        for q in questions:
            if q.payee in self.answers:
                category, reason = self.answers[q.payee] or (None, "")
                guesses[q.key] = Guess(category.id if category else None, reason)
        return guesses, self.status


class AICategorizeTests(TestCase):
    """The AI scenarios in openspec/specs/auto-categorization."""

    def setUp(self):
        self.checking = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)
        self.groceries = Category.objects.create(name="Groceries")
        self.eating_out = Category.objects.create(name="Eating out")
        self.food = Category.objects.create(name="Food")
        self.lunch = Category.objects.create(name="Lunch", parent=self.food)

    def txn(self, payee, amount_cents=-1000, day=1, category=None, notes=""):
        return Transaction.objects.create(
            account=self.checking,
            date=date(2026, 10, day),
            amount_cents=amount_cents,
            payee=payee,
            notes=notes,
            category=category,
        )

    def run_with(self, guesser, transactions):
        with mock.patch("transactions.categorize.get_guesser", return_value=guesser):
            return categorize(transactions)

    def test_a_new_payee_gets_an_ai_guess(self):
        guesser = FakeGuesser({"Bistro Lumiere": (self.eating_out, "Restaurant name")})
        new = self.txn("Bistro Lumiere", day=20)

        result = self.run_with(guesser, [new])

        new.refresh_from_db()
        self.assertEqual(new.category, self.eating_out)
        self.assertFalse(new.category_confirmed)
        self.assertEqual(new.category_source, "ai")
        self.assertEqual(new.category_reason, "Restaurant name")
        self.assertEqual((result.history, result.ai, result.ai_status), (0, 1, "ok"))

    def test_history_runs_first(self):
        Transaction.objects.create(
            account=self.checking, date=date(2026, 10, 1), amount_cents=-500, payee="Carrefour", category=self.groceries
        )
        guesser = FakeGuesser({"Carrefour": (self.eating_out, "Shop"), "Bistro": (self.eating_out, "Restaurant")})
        known, unknown = self.txn("Carrefour", day=20), self.txn("Bistro", day=21)

        result = self.run_with(guesser, [known, unknown])

        known.refresh_from_db()
        self.assertEqual(known.category, self.groceries)
        self.assertEqual(known.category_source, "history")
        self.assertEqual([q.payee for q in guesser.questions], ["Bistro"])
        self.assertEqual((result.history, result.ai, result.categorized), (1, 1, 2))

    def test_repeat_payees_are_sent_once(self):
        guesser = FakeGuesser({"BISTRO LUMIERE 34": (self.eating_out, "Restaurant name")})
        bistro = [self.txn("Bistro Lumiere 12", day=3), self.txn("BISTRO LUMIERE 34", day=9, amount_cents=-4800)]
        others = [self.txn("NMBS", day=4), self.txn("Kinepolis", day=5)]

        result = self.run_with(guesser, bistro + others)

        self.assertEqual(len(guesser.questions), 3)
        question = next(q for q in guesser.questions if q.payee.lower().startswith("bistro"))
        # The most recent raw payee and the largest amount represent the key.
        self.assertEqual((question.payee, question.amount_cents, question.direction), ("BISTRO LUMIERE 34", -4800, "out"))
        for txn in bistro:
            txn.refresh_from_db()
            self.assertEqual(txn.category, self.eating_out)
        self.assertEqual(result.ai, 2)

    def test_the_model_may_decline(self):
        guesser = FakeGuesser({"PAYPAL *X123": None})
        new = self.txn("PAYPAL *X123", day=20)

        result = self.run_with(guesser, [new])

        new.refresh_from_db()
        self.assertIsNone(new.category)
        self.assertEqual((result.ai, result.ai_declined, result.ai_status), (0, 1, "ok"))

    def test_only_real_categories_are_accepted(self):
        made_up = Category(id=9999, name="Made up")
        guesser = FakeGuesser({"Bistro": (made_up, "Restaurant")})
        new = self.txn("Bistro", day=20)

        result = self.run_with(guesser, [new])

        new.refresh_from_db()
        self.assertIsNone(new.category)
        self.assertEqual(result.ai, 0)

    def test_categories_are_sent_with_parent_labels(self):
        guesser = FakeGuesser()
        self.run_with(guesser, [self.txn("Bistro", day=20)])

        self.assertIn((self.lunch.id, "Food / Lunch"), guesser.categories)
        self.assertIn((self.groceries.id, "Groceries"), guesser.categories)

    def assert_history_kept(self, guesser):
        Transaction.objects.create(
            account=self.checking, date=date(2026, 10, 1), amount_cents=-500, payee="Carrefour", category=self.groceries
        )
        known, unknown = self.txn("Carrefour", day=20), self.txn("Bistro", day=21)

        result = self.run_with(guesser, [known, unknown])

        known.refresh_from_db()
        unknown.refresh_from_db()
        self.assertEqual(known.category, self.groceries)
        self.assertIsNone(unknown.category)
        self.assertEqual((result.history, result.ai, result.ai_status), (1, 0, "failed"))

    def test_a_failing_guesser_keeps_the_history_guesses(self):
        self.assert_history_kept(FakeGuesser(status="failed"))

    def test_a_raising_guesser_keeps_the_history_guesses(self):
        with self.assertLogs("transactions.categorize", "ERROR"):
            self.assert_history_kept(FakeGuesser(error=RuntimeError("boom")))

    def test_skipped_when_nothing_is_left_to_ask(self):
        Transaction.objects.create(
            account=self.checking, date=date(2026, 10, 1), amount_cents=-500, payee="Carrefour", category=self.groceries
        )
        guesser = FakeGuesser()
        result = self.run_with(guesser, [self.txn("Carrefour", day=20), self.txn("12345", day=21)])

        self.assertEqual(guesser.questions, [])
        self.assertEqual(result.ai_status, "skipped")

    def test_questions_carry_only_the_allowed_fields(self):
        guesser = FakeGuesser()
        self.run_with(guesser, [self.txn("Bistro Lumiere", amount_cents=-4800, day=12, notes="team lunch " * 40)])

        self.assertEqual(
            {f.name for f in fields(PayeeQuestion)}, {"key", "payee", "notes", "amount_cents", "direction"}
        )
        question = guesser.questions[0]
        self.assertEqual(question.payee, "Bistro Lumiere")
        self.assertEqual(len(question.notes), 200)
        self.assertNotIn("Checking", repr(question))
        self.assertNotIn("2026", repr(question))

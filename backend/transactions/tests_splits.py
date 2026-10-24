from datetime import date

from django.test import TestCase

from accounts.models import Account
from budgets.models import Category

from .models import Transaction
from .splits import SplitError, SplitLine, delete_transaction, save_split, sync_parts, unsplit
from .transfers import link_transfer


class SplitServiceTests(TestCase):
    def setUp(self):
        self.checking = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)
        self.savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        self.restaurants = Category.objects.create(name="Restaurants")
        self.gifts = Category.objects.create(name="Gifts")
        self.dinner = self.txn(self.checking, -6000, 3, payee="Pizzeria")

    def txn(self, account, amount_cents, day, payee="bank line", **kwargs):
        return Transaction.objects.create(
            account=account, date=date(2026, 3, day), amount_cents=amount_cents, payee=payee, **kwargs
        )

    def parts(self, txn):
        return list(Transaction.objects.filter(split_parent=txn).order_by("pk"))

    def split_in_two(self, second_target=None):
        return save_split(
            self.dinner,
            [
                SplitLine(-3000, category=self.restaurants, notes="my half"),
                SplitLine(-3000, transfer_account=second_target) if second_target else SplitLine(-3000, category=self.gifts),
            ],
        )

    # --- splitting ---

    def test_split_a_dinner_in_two(self):
        dinner = save_split(
            self.dinner, [SplitLine(-3000, category=self.restaurants, notes="my half"), SplitLine(-3000)]
        )

        self.assertIsNone(dinner.category)
        first, second = self.parts(dinner)
        self.assertEqual((first.amount_cents, first.category, first.notes), (-3000, self.restaurants, "my half"))
        self.assertEqual((second.amount_cents, second.category), (-3000, None))
        for part in (first, second):
            self.assertEqual((part.account, part.date, part.payee), (self.checking, dinner.date, "Pizzeria"))
            self.assertTrue(part.category_confirmed)
            self.assertEqual(part.category_source, Transaction.CategorySource.MANUAL)

    def test_splitting_a_categorized_transaction_moves_the_category_to_the_parts(self):
        self.dinner.category = self.restaurants
        self.dinner.category_confirmed = False
        self.dinner.category_source = Transaction.CategorySource.AI
        self.dinner.category_reason = "pizza"
        self.dinner.save()

        dinner = self.split_in_two()

        self.assertIsNone(dinner.category)
        self.assertTrue(dinner.category_confirmed)
        self.assertEqual((dinner.category_source, dinner.category_reason), ("manual", ""))

    def assertRejected(self, lines, txn=None, line=None):
        txn = txn or self.dinner
        with self.assertRaises(SplitError) as caught:
            save_split(txn, lines)
        self.assertEqual(caught.exception.line, line)
        self.assertEqual(self.parts(txn), [])

    def test_parts_must_add_up(self):
        self.assertRejected([SplitLine(-3000), SplitLine(-2000)])

    def test_at_least_two_parts(self):
        self.assertRejected([SplitLine(-6000)])

    def test_parts_keep_the_transactions_sign(self):
        self.assertRejected([SplitLine(-7000), SplitLine(1000)], line=1)

    def test_parts_need_an_amount(self):
        self.assertRejected([SplitLine(-6000), SplitLine(0)], line=1)

    def test_a_part_cant_have_a_category_and_a_transfer(self):
        self.assertRejected(
            [SplitLine(-3000, category=self.gifts, transfer_account=self.savings), SplitLine(-3000)], line=0
        )

    def test_a_transfer_cant_be_split(self):
        link_transfer(self.dinner, self.savings)

        self.assertRejected([SplitLine(-3000), SplitLine(-3000)])
        self.assertIsNotNone(Transaction.objects.get(pk=self.dinner.pk).transfer_counterpart)

    def test_parts_cant_be_split(self):
        dinner = self.split_in_two()
        part = self.parts(dinner)[0]

        self.assertRejected([SplitLine(-1500), SplitLine(-1500)], txn=part)

    def test_unknown_part_id_is_rejected(self):
        other = self.txn(self.checking, -100, 3)

        self.assertRejected([SplitLine(-3000, id=other.pk), SplitLine(-3000)], line=0)

    # --- parts that are transfers ---

    def test_a_part_becomes_a_transfer_with_a_created_counterpart(self):
        dinner = self.split_in_two(second_target=self.savings)

        part = self.parts(dinner)[1]
        counterpart = part.transfer_counterpart
        self.assertEqual((counterpart.account, counterpart.amount_cents), (self.savings, 3000))
        self.assertTrue(counterpart.created_by_transfer)
        self.assertIsNone(counterpart.split_parent)

    def test_a_refused_transfer_target_names_its_line_and_saves_nothing(self):
        self.assertRejected(
            [SplitLine(-3000, category=self.restaurants), SplitLine(-3000, transfer_account=self.checking)], line=1
        )
        self.assertEqual(Transaction.objects.get(pk=self.dinner.pk).category, None)

    # --- editing ---

    def test_rebalancing_keeps_the_parts(self):
        dinner = self.split_in_two()
        first, second = self.parts(dinner)

        save_split(
            dinner,
            [
                SplitLine(-4000, category=self.restaurants, id=first.pk),
                SplitLine(-2000, category=self.gifts, id=second.pk),
            ],
        )

        self.assertEqual(
            [(p.pk, p.amount_cents, p.category) for p in self.parts(dinner)],
            [(first.pk, -4000, self.restaurants), (second.pk, -2000, self.gifts)],
        )

    def test_editing_keeps_a_real_transfer_link(self):
        dinner = save_split(self.dinner, [SplitLine(-3000, category=self.restaurants), SplitLine(-3000)])
        first, second = self.parts(dinner)
        imported = self.txn(self.savings, 3000, 4)
        link_transfer(second, self.savings)

        save_split(
            dinner,
            [
                SplitLine(-3000, category=self.gifts, id=first.pk),
                SplitLine(-3000, transfer_account=self.savings, id=second.pk),
            ],
        )

        self.assertEqual(Transaction.objects.get(pk=second.pk).transfer_counterpart, imported)

    def test_changing_a_transfer_parts_amount_mirrors_its_created_counterpart(self):
        dinner = self.split_in_two(second_target=self.savings)
        first, second = self.parts(dinner)

        save_split(
            dinner,
            [
                SplitLine(-2000, category=self.restaurants, id=first.pk),
                SplitLine(-4000, transfer_account=self.savings, id=second.pk),
            ],
        )

        self.assertEqual(Transaction.objects.get(pk=second.pk).transfer_counterpart.amount_cents, 4000)

    def test_removing_a_transfer_part_deletes_its_created_counterpart(self):
        dinner = save_split(
            self.dinner,
            [SplitLine(-2000, category=self.restaurants), SplitLine(-2000, category=self.gifts),
             SplitLine(-2000, transfer_account=self.savings)],
        )
        first, second, third = self.parts(dinner)
        counterpart_pk = third.transfer_counterpart_id

        save_split(
            dinner,
            [SplitLine(-4000, category=self.restaurants, id=first.pk), SplitLine(-2000, category=self.gifts, id=second.pk)],
        )

        self.assertEqual([p.pk for p in self.parts(dinner)], [first.pk, second.pk])
        self.assertFalse(Transaction.objects.filter(pk__in=[third.pk, counterpart_pk]).exists())

    def test_removing_a_transfer_part_keeps_a_real_counterpart(self):
        dinner = self.split_in_two()
        first, second = self.parts(dinner)
        imported = self.txn(self.savings, 3000, 3)
        link_transfer(second, self.savings)

        save_split(
            dinner,
            [SplitLine(-3000, category=self.restaurants, id=first.pk), SplitLine(-3000, category=self.gifts)],
        )

        imported.refresh_from_db()
        self.assertIsNone(imported.transfer_counterpart)
        self.assertIsNone(imported.category)

    # --- unsplitting ---

    def test_unsplit_to_no_category(self):
        dinner = unsplit(self.split_in_two())

        self.assertEqual(self.parts(dinner), [])
        self.assertIsNone(dinner.category)

    def test_unsplit_keeps_a_chosen_category(self):
        dinner = unsplit(self.split_in_two(), category=self.restaurants)

        self.assertEqual(dinner.category, self.restaurants)
        self.assertTrue(dinner.category_confirmed)

    def test_unsplit_to_a_transfer_matches_the_whole_amount(self):
        dinner = self.split_in_two(second_target=self.savings)
        part_counterpart = self.parts(dinner)[1].transfer_counterpart_id
        whole = self.txn(self.savings, 6000, 4)

        dinner = unsplit(dinner, transfer_account=self.savings)

        self.assertEqual(dinner.transfer_counterpart, whole)
        self.assertFalse(Transaction.objects.filter(pk=part_counterpart).exists())

    def test_unsplit_with_a_real_transfer_counterpart_leaves_it_uncategorized(self):
        dinner = self.split_in_two()
        second = self.parts(dinner)[1]
        imported = self.txn(self.savings, 3000, 3)
        link_transfer(second, self.savings)

        unsplit(dinner)

        imported.refresh_from_db()
        self.assertIsNone(imported.transfer_counterpart)

    def test_unsplitting_an_unsplit_transaction_is_refused(self):
        with self.assertRaises(SplitError):
            unsplit(self.dinner)

    # --- deleting ---

    def test_deleting_a_split_transaction_deletes_its_parts_and_created_counterparts(self):
        dinner = self.split_in_two(second_target=self.savings)
        counterpart_pk = self.parts(dinner)[1].transfer_counterpart_id

        delete_transaction(dinner)

        self.assertFalse(Transaction.objects.filter(pk=counterpart_pk).exists())
        self.assertEqual(Transaction.objects.count(), 0)

    def test_a_part_cant_be_deleted_on_its_own(self):
        part = self.parts(self.split_in_two())[0]

        with self.assertRaises(SplitError):
            delete_transaction(part)

    # --- date and payee ---

    def test_sync_parts_moves_date_and_payee_and_mirrors_created_counterparts(self):
        dinner = self.split_in_two(second_target=self.savings)
        dinner.date = date(2026, 3, 4)
        dinner.payee = "Pizzeria Napoli"
        dinner.save()

        sync_parts(dinner)

        for part in self.parts(dinner):
            self.assertEqual((part.date, part.payee), (date(2026, 3, 4), "Pizzeria Napoli"))
        counterpart = self.parts(dinner)[1].transfer_counterpart
        self.assertEqual(counterpart.date, date(2026, 3, 4))

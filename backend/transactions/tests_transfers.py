from datetime import date

from django.test import TestCase

from accounts.models import Account
from budgets.models import Category

from .models import Transaction
from .splits import SplitLine, save_split
from .transfers import TransferError, delete_transaction, link_transfer, mirror_edit, unlink_transfer


class TransferServiceTests(TestCase):
    def setUp(self):
        self.checking = Account.objects.create(name="Checking", account_type="checking", starting_balance_cents=0)
        self.savings = Account.objects.create(name="Savings", account_type="savings", starting_balance_cents=0)
        self.old = Account.objects.create(
            name="Old", account_type="savings", starting_balance_cents=0, archived=True
        )
        self.groceries = Category.objects.create(name="Groceries")

    def txn(self, account, amount_cents, day, **kwargs):
        return Transaction.objects.create(
            account=account, date=date(2026, 3, day), amount_cents=amount_cents, payee="bank line", **kwargs
        )

    def refreshed(self, *txns):
        return [Transaction.objects.get(pk=t.pk) for t in txns]

    # --- matching ---

    def test_links_an_opposite_amount_across_different_booking_dates(self):
        out = self.txn(self.checking, -50000, 3)
        incoming = self.txn(self.savings, 50000, 5)

        link_transfer(out, self.savings)

        out, incoming = self.refreshed(out, incoming)
        self.assertEqual(out.transfer_counterpart, incoming)
        self.assertEqual(incoming.transfer_counterpart, out)
        self.assertEqual((out.date.day, incoming.date.day), (3, 5))
        self.assertFalse(incoming.created_by_transfer)
        self.assertEqual(Transaction.objects.filter(account=self.savings).count(), 1)

    def test_closest_date_wins(self):
        out = self.txn(self.checking, -50000, 3)
        self.txn(self.savings, 50000, 1)
        closer = self.txn(self.savings, 50000, 4)

        _, counterpart = link_transfer(out, self.savings)

        self.assertEqual(counterpart, closer)

    def test_only_unlinked_same_amount_inside_the_window_matches(self):
        out = self.txn(self.checking, -50000, 3)
        self.txn(self.savings, 50000, 9)  # 6 days later: outside the window
        self.txn(self.savings, 40000, 3)  # wrong amount
        self.txn(self.savings, -50000, 3)  # same sign, not opposite
        already = self.txn(self.savings, 50000, 3)
        other = self.txn(self.checking, -50000, 2)
        link_transfer(other, self.savings)  # takes `already`

        _, counterpart = link_transfer(out, self.savings)

        self.assertNotEqual(counterpart.pk, already.pk)
        self.assertTrue(counterpart.created_by_transfer)

    def test_matched_transaction_loses_its_category(self):
        out = self.txn(self.checking, -50000, 3, category=self.groceries)
        incoming = self.txn(self.savings, 50000, 3, category=self.groceries)

        link_transfer(out, self.savings)

        out, incoming = self.refreshed(out, incoming)
        self.assertIsNone(out.category)
        self.assertIsNone(incoming.category)

    # --- creation ---

    def test_creates_the_counterpart_when_nothing_matches(self):
        out = self.txn(self.checking, -50000, 3)

        _, counterpart = link_transfer(out, self.savings)

        self.assertEqual(counterpart.account, self.savings)
        self.assertEqual(counterpart.amount_cents, 50000)
        self.assertEqual(counterpart.date, date(2026, 3, 3))
        self.assertEqual(counterpart.payee, "Transfer from Checking")
        self.assertTrue(counterpart.created_by_transfer)
        self.assertEqual(self.refreshed(out)[0].transfer_counterpart, counterpart)

    def test_created_counterpart_for_an_inflow_is_an_outflow(self):
        incoming = self.txn(self.savings, 20000, 3)

        _, counterpart = link_transfer(incoming, self.checking)

        self.assertEqual(counterpart.amount_cents, -20000)
        self.assertEqual(counterpart.payee, "Transfer to Savings")

    # --- refusals ---

    def test_refuses_the_same_account(self):
        out = self.txn(self.checking, -50000, 3)
        with self.assertRaises(TransferError):
            link_transfer(out, self.checking)

    def test_refuses_an_archived_account(self):
        out = self.txn(self.checking, -50000, 3)
        with self.assertRaises(TransferError):
            link_transfer(out, self.old)
        self.assertIsNone(self.refreshed(out)[0].transfer_counterpart)

    # --- re-targeting and unlinking ---

    def test_linking_to_another_account_moves_the_link(self):
        cash = Account.objects.create(name="Cash", account_type="cash", starting_balance_cents=0)
        out = self.txn(self.checking, -50000, 3)
        _, created = link_transfer(out, self.savings)

        _, counterpart = link_transfer(out, cash)

        self.assertEqual(counterpart.account, cash)
        self.assertFalse(Transaction.objects.filter(pk=created.pk).exists())

    def test_unlinking_keeps_a_confirmed_counterpart_as_a_normal_transaction(self):
        out = self.txn(self.checking, -50000, 3)
        incoming = self.txn(self.savings, 50000, 4)
        link_transfer(out, self.savings)

        unlink_transfer(out)

        out, incoming = self.refreshed(out, incoming)
        self.assertIsNone(out.transfer_counterpart)
        self.assertIsNone(incoming.transfer_counterpart)
        self.assertIsNone(incoming.category)

    def test_unlinking_deletes_a_created_counterpart(self):
        out = self.txn(self.checking, -50000, 3)
        _, created = link_transfer(out, self.savings)

        unlink_transfer(out)

        self.assertFalse(Transaction.objects.filter(pk=created.pk).exists())
        self.assertIsNone(self.refreshed(out)[0].transfer_counterpart)

    def test_unlinking_a_created_counterpart_itself_keeps_it_as_normal(self):
        out = self.txn(self.checking, -50000, 3)
        _, created = link_transfer(out, self.savings)

        unlink_transfer(created)

        created, out = self.refreshed(created, out)
        self.assertIsNone(created.transfer_counterpart)
        self.assertFalse(created.created_by_transfer)
        self.assertIsNone(out.transfer_counterpart)

    # --- deleting ---

    def test_deleting_one_side_keeps_a_confirmed_counterpart(self):
        out = self.txn(self.checking, -50000, 3)
        incoming = self.txn(self.savings, 50000, 4)
        link_transfer(out, self.savings)

        delete_transaction(out)

        self.assertFalse(Transaction.objects.filter(pk=out.pk).exists())
        incoming = self.refreshed(incoming)[0]
        self.assertIsNone(incoming.transfer_counterpart)

    def test_deleting_one_side_removes_a_created_counterpart(self):
        out = self.txn(self.checking, -50000, 3)
        _, created = link_transfer(out, self.savings)

        delete_transaction(out)

        self.assertFalse(Transaction.objects.filter(pk=created.pk).exists())

    # --- edits ---

    def test_edits_follow_to_a_created_counterpart(self):
        out = self.txn(self.checking, -50000, 3)
        out, created = link_transfer(out, self.savings)
        out.amount_cents = -55000
        out.date = date(2026, 3, 6)
        out.save()

        mirror_edit(out)

        created = self.refreshed(created)[0]
        self.assertEqual((created.amount_cents, created.date), (55000, date(2026, 3, 6)))

    def test_confirmed_sides_are_edited_independently(self):
        out = self.txn(self.checking, -50000, 3)
        incoming = self.txn(self.savings, 50000, 4)
        out, _ = link_transfer(out, self.savings)
        out.date = date(2026, 3, 1)
        out.save()

        mirror_edit(out)

        self.assertEqual(self.refreshed(incoming)[0].date, date(2026, 3, 4))

    # --- splits ---

    def test_splits_are_never_matched(self):
        split = self.txn(self.savings, 50000, 4)
        save_split(split, [SplitLine(30000), SplitLine(20000)])
        out = self.txn(self.checking, -50000, 3)

        _, counterpart = link_transfer(out, self.savings)

        self.assertNotEqual(counterpart, split)
        self.assertTrue(counterpart.created_by_transfer)
        self.assertIsNone(counterpart.split_parent)

    def test_a_part_is_never_matched(self):
        split = self.txn(self.savings, 80000, 4)
        save_split(split, [SplitLine(50000), SplitLine(30000)])
        out = self.txn(self.checking, -50000, 3)

        _, counterpart = link_transfer(out, self.savings)

        self.assertTrue(counterpart.created_by_transfer)

    def test_a_split_transaction_cant_be_a_transfer(self):
        out = self.txn(self.checking, -50000, 3)
        save_split(out, [SplitLine(-30000), SplitLine(-20000)])

        with self.assertRaises(TransferError):
            link_transfer(out, self.savings)

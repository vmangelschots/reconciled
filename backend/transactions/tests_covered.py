from datetime import date

from households.testing import TestCase

from accounts.models import Account
from budgets.models import Category
from reports.spending import month_spending

from . import covered
from .covered import CoveredError, CoveredInput
from .models import Transaction
from .tabs import tab_detail


class CoveredTestCase(TestCase):
    def setUp(self):
        self.joint = Account.objects.create(name="Joint", account_type="checking", starting_balance_cents=0)
        self.takeout = Category.objects.create(name="Takeout")
        self.tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        self.sarah = Category.objects.create(name="Sarah", parent=self.tabs)
        self.jan = Category.objects.create(name="Jan", parent=self.tabs)

    def entry(self, amount_cents=1500, day=11, category=None, payee="Sushi Palace", tab=None):
        return covered.create(
            tab or self.sarah,
            CoveredInput(date(2026, 11, day), payee, amount_cents, category or self.takeout),
        )

    def lend(self, amount_cents, day=3, tab=None):
        return Transaction.objects.create(
            account=self.joint, date=date(2026, 10, day), amount_cents=-amount_cents, payee="Pizzeria",
            category=tab or self.sarah,
        )


class OffBankAccountTests(CoveredTestCase):
    """1.1: the off-bank account is left out of visible() and stays at 0."""

    def test_visible_leaves_out_the_off_bank_account(self):
        self.entry()

        self.assertEqual(list(Account.objects.visible()), [self.joint])
        self.assertEqual(Account.objects.count(), 2)

    def test_its_balance_stays_zero(self):
        self.entry(1500)
        self.entry(2500, day=12)

        self.assertEqual(covered.off_bank_account().current_balance_cents, 0)

    def test_one_off_bank_account_per_household(self):
        self.entry()
        self.entry(day=12)

        self.assertEqual(Account.objects.filter(is_off_bank=True).count(), 1)


class PairLinkTests(CoveredTestCase):
    """1.2: the cost goes with its tab half."""

    def test_deleting_the_tab_half_deletes_the_cost(self):
        tab_row = self.entry()

        tab_row.delete()

        self.assertFalse(Transaction.objects.filter(account__is_off_bank=True).exists())


class RecordCoveredTests(CoveredTestCase):
    """"Record what the tab's person paid for" and "A covered entry's
    category is not a tab"."""

    def test_takeout_netted_against_an_open_tab(self):
        self.lend(1000)

        self.entry(1500)

        self.assertEqual(tab_detail(self.sarah).balance_cents, -500)
        spent, _ = month_spending(date(2026, 11, 1))
        self.assertEqual(spent[self.takeout.id], 1500)

    def test_the_tab_half_is_not_spending(self):
        self.entry(1500)

        spent, uncategorized = month_spending(date(2026, 11, 1))

        self.assertNotIn(self.sarah.id, spent)
        self.assertEqual(uncategorized, 0)

    def test_covered_on_a_settled_tab(self):
        self.lend(1000)
        Transaction.objects.create(
            account=self.joint, date=date(2026, 10, 5), amount_cents=1000, payee="SARAH", category=self.sarah
        )

        self.entry(2000, day=20, category=self.takeout, payee="Groceries")

        summary = tab_detail(self.sarah)
        self.assertEqual((summary.balance_cents, summary.open_since), (-2000, date(2026, 11, 20)))

    def test_repaying_a_covered_entry(self):
        self.lend(1000)
        self.entry(1500)

        Transaction.objects.create(
            account=self.joint, date=date(2026, 11, 20), amount_cents=-500, payee="SARAH", category=self.sarah
        )

        self.assertEqual(tab_detail(self.sarah).balance_cents, 0)

    def test_missing_amount_or_category(self):
        for amount, category, field in ((0, self.takeout, "amount_cents"), (-500, self.takeout, "amount_cents"),
                                        (1500, None, "category")):
            with self.subTest(field=field, amount=amount), self.assertRaises(CoveredError) as caught:
                covered.create(self.sarah, CoveredInput(date(2026, 11, 11), "Sushi", amount, category))
            self.assertEqual(caught.exception.field, field)

        self.assertFalse(Transaction.objects.exists())

    def test_a_tab_or_tab_group_is_rejected(self):
        for category in (self.jan, self.tabs):
            with self.subTest(category=category.name), self.assertRaises(CoveredError):
                self.entry(category=category)

        self.assertFalse(Transaction.objects.exists())


class EditCoveredTests(CoveredTestCase):
    def test_change_the_amount(self):
        tab_row = self.entry(1500)

        covered.update(tab_row, CoveredInput(date(2026, 11, 11), "Sushi Palace", 1200, self.takeout))

        self.assertEqual(tab_detail(self.sarah).balance_cents, -1200)
        spent, _ = month_spending(date(2026, 11, 1))
        self.assertEqual(spent[self.takeout.id], 1200)
        self.assertEqual(covered.off_bank_account().current_balance_cents, 0)

    def test_change_category_and_date_moves_both_halves(self):
        restaurants = Category.objects.create(name="Restaurants")
        tab_row = self.entry(1500)

        covered.update(tab_row, CoveredInput(date(2026, 12, 2), "Sushi Palace", 1500, restaurants))

        tab_row.refresh_from_db()
        cost = tab_row.covered_cost
        self.assertEqual((tab_row.date, cost.date, cost.category, tab_row.category),
                         (date(2026, 12, 2), date(2026, 12, 2), restaurants, self.sarah))

    def test_delete_both_halves(self):
        tab_row = self.entry(1500)

        covered.delete(tab_row)

        self.assertEqual(tab_detail(self.sarah).balance_cents, 0)
        spent, _ = month_spending(date(2026, 11, 1))
        self.assertNotIn(self.takeout.id, spent)


class CategoryGuardTests(CoveredTestCase):
    def test_the_cost_never_changes_category_outside_covered(self):
        cost = self.entry().covered_cost

        with self.assertRaises(CoveredError):
            covered.check_category_change(cost, Category.objects.create(name="Restaurants"))

    def test_the_tab_half_only_moves_to_another_tab(self):
        tab_row = self.entry()

        covered.check_category_change(tab_row, self.jan)
        for category in (None, self.takeout):
            with self.assertRaises(CoveredError):
                covered.check_category_change(tab_row, category)

    def test_an_ordinary_row_is_unaffected(self):
        row = self.lend(1000)

        covered.check_category_change(row, self.takeout)

from datetime import date

from django.test import TestCase

from accounts.models import Account
from budgets.models import Category

from .models import Transaction
from .splits import SplitLine, save_split
from .tabs import balances, tab_detail


class TabBalanceTests(TestCase):
    """The balance and open-since scenarios in openspec/specs/repayment-tabs."""

    def setUp(self):
        self.joint = Account.objects.create(name="Joint", account_type="checking", starting_balance_cents=0)
        self.restaurants = Category.objects.create(name="Restaurants")
        self.income = Category.objects.create(name="Income")
        self.tabs = Category.objects.create(name="Tabs", is_tab_group=True)
        self.jan = Category.objects.create(name="Jan", parent=self.tabs)
        self.employer = Category.objects.create(name="Employer", parent=self.tabs)

    def txn(self, amount_cents, month, day, category=None, account=None, payee="bank line"):
        return Transaction.objects.create(
            account=account or self.joint,
            date=date(2026, month, day),
            amount_cents=amount_cents,
            payee=payee,
            category=category,
        )

    def test_half_a_dinner_to_a_tab(self):
        dinner = self.txn(-6000, 10, 3, payee="Pizzeria")
        save_split(dinner, [SplitLine(-3000, category=self.restaurants), SplitLine(-3000, category=self.jan)])

        summary = tab_detail(self.jan)

        self.assertEqual((summary.balance_cents, summary.open_since), (3000, date(2026, 10, 3)))
        [(row, running)] = summary.rows
        self.assertEqual((row.split_parent_id, row.amount_cents, running), (dinner.pk, -3000, 3000))

    def test_a_repayment_settles_the_tab(self):
        self.txn(-3000, 10, 3, category=self.jan)
        self.txn(3000, 10, 12, category=self.jan, payee="JAN PEETERS")

        summary = tab_detail(self.jan)

        self.assertEqual((summary.balance_cents, summary.open_since), (0, None))
        self.assertEqual([running for _, running in summary.rows], [3000, 0])

    def test_partial_and_lump_sum_repayments(self):
        for amount, day in ((-3000, 1), (-4500, 2), (2000, 3), (4000, 4)):
            self.txn(amount, 10, day, category=self.jan)

        summary = tab_detail(self.jan)

        self.assertEqual(summary.balance_cents, 1500)
        self.assertEqual([running for _, running in summary.rows], [3000, 7500, 5500, 1500])

    def test_overpaying(self):
        self.txn(-3000, 10, 3, category=self.jan)
        self.txn(3500, 10, 12, category=self.jan)

        summary = tab_detail(self.jan)

        self.assertEqual((summary.balance_cents, summary.open_since), (-500, date(2026, 10, 3)))

    def test_a_reimbursement_inside_a_salary(self):
        self.txn(-15000, 9, 12, category=self.employer)
        salary = self.txn(300000, 9, 30, payee="ACME SALARY")
        save_split(salary, [SplitLine(285000, category=self.income), SplitLine(15000, category=self.employer)])

        self.assertEqual(tab_detail(self.employer).balance_cents, 0)

    def test_open_since_the_first_row_after_settling(self):
        self.txn(-3000, 9, 1, category=self.jan)
        self.txn(3000, 9, 5, category=self.jan)
        self.txn(-4500, 10, 12, category=self.jan)

        self.assertEqual(tab_detail(self.jan).open_since, date(2026, 10, 12))

    def test_a_partial_repayment_doesnt_reset_the_date(self):
        self.txn(-15000, 9, 12, category=self.employer)
        self.txn(10000, 9, 30, category=self.employer)

        self.assertEqual(tab_detail(self.employer).open_since, date(2026, 9, 12))

    def test_rows_in_an_archived_account_still_count(self):
        old = Account.objects.create(name="Old", account_type="checking", starting_balance_cents=0, archived=True)
        self.txn(-3000, 10, 3, category=self.jan, account=old)

        self.assertEqual(tab_detail(self.jan).balance_cents, 3000)

    def test_a_split_transaction_itself_is_not_a_row(self):
        dinner = self.txn(-6000, 10, 3)
        save_split(dinner, [SplitLine(-3000, category=self.jan), SplitLine(-3000, category=self.jan)])

        self.assertEqual(len(tab_detail(self.jan).rows), 2)

    def test_balances_lists_every_tab_largest_first(self):
        self.txn(-3000, 10, 3, category=self.jan)
        self.txn(-41250, 9, 1, category=self.employer)
        piet = Category.objects.create(name="Piet", parent=self.tabs)
        self.txn(-1000, 10, 1, category=self.restaurants)

        summaries = balances()

        self.assertEqual(
            [(s.category, s.balance_cents) for s in summaries],
            [(self.employer, 41250), (self.jan, 3000), (piet, 0)],
        )
        self.assertIsNone(summaries[-1].open_since)

    def test_no_tabs(self):
        Category.objects.all().delete()

        self.assertEqual(balances(), [])

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.db import IntegrityError
from django.db import transaction as db_transaction
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from accounts.models import Account, Loan
from budgets.models import Category

from . import splits, transfers
from .adjustments import set_value
from .loans import (
    LoanError,
    _post_installment,
    add_correction,
    compute_schedule,
    edit_loan,
    installment_states,
    link_candidates,
    link_payment,
    missed_installment,
    preview,
    preview_correction,
    preview_removal,
    remove_correction,
    remove_loan,
    schedule,
    set_up_loan,
    suggest_correction,
    sync_loan,
    unlink_payment,
)
from .models import Transaction


def euros(amount):
    return round(amount * 100)


class ScheduleTests(SimpleTestCase):
    """The loan-schedules spec's "Annuity schedule" and "Installment
    dates"."""

    def test_the_belgian_monthly_rate(self):
        installments = compute_schedule(euros(200000), "3.00", 300, date(2024, 12, 2))
        self.assertEqual(len(installments), 300)
        first = installments[0]
        # 3.00% / 12 would give 948.42.
        self.assertEqual(first.payment_cents, euros(944.22))
        self.assertEqual(first.interest_cents, euros(493.25))
        self.assertEqual(first.principal_cents, euros(450.97))
        self.assertEqual(first.balance_after_cents, euros(199549.03))
        self.assertEqual(installments[1].balance_after_cents, euros(199096.95))
        self.assertEqual(installments[2].balance_after_cents, euros(198643.76))
        self.assertEqual(installments[-1].date, date(2049, 11, 2))
        self.assertEqual(installments[-1].balance_after_cents, 0)

    def test_the_last_installment_absorbs_the_rounding(self):
        installments = compute_schedule(euros(1000), "6.00", 3, date(2027, 1, 31))
        self.assertEqual(
            [(i.payment_cents, i.interest_cents, i.principal_cents, i.balance_after_cents) for i in installments],
            [
                (euros(336.58), euros(4.87), euros(331.71), euros(668.29)),
                (euros(336.58), euros(3.25), euros(333.33), euros(334.96)),
                (euros(336.59), euros(1.63), euros(334.96), 0),
            ],
        )

    def test_a_loan_without_interest(self):
        installments = compute_schedule(euros(1200), "0", 12, date(2027, 1, 1))
        self.assertTrue(all(i.interest_cents == 0 and i.principal_cents == euros(100) for i in installments))
        self.assertEqual(installments[-1].balance_after_cents, 0)

    def test_month_ends(self):
        installments = compute_schedule(euros(1000), "6.00", 3, date(2027, 1, 31))
        self.assertEqual([i.date for i in installments], [date(2027, 1, 31), date(2027, 2, 28), date(2027, 3, 31)])


@dataclass
class Correction:
    date: date
    balance_cents: int
    payment_cents: int | None = None
    pk: int = 1


class CorrectionScheduleTests(SimpleTestCase):
    """The loan-schedules spec's "The schedule restarts from a correction"
    and "Choose the payment after a correction"."""

    def mortgage(self, *corrections):
        return compute_schedule(euros(200000), "3.00", 300, date(2024, 12, 2), corrections)

    def test_a_lower_payment_over_the_same_term(self):
        installments = self.mortgage(Correction(date(2026, 11, 12), euros(170000)))
        self.assertEqual(len(installments), 300)
        self.assertEqual({i.payment_cents for i in installments[:24]}, {euros(944.22)})
        self.assertEqual({i.payment_cents for i in installments[24:-1]}, {euros(849.91)})
        self.assertEqual((installments[24].number, installments[24].date), (25, date(2026, 12, 2)))
        self.assertEqual((installments[-1].date, installments[-1].payment_cents), (date(2049, 11, 2), euros(848.39)))
        self.assertEqual(installments[-1].balance_after_cents, 0)
        self.assertEqual([i.correction_id for i in installments[23:25]], [None, 1])

    def test_paid_off_early(self):
        installments = self.mortgage(Correction(date(2026, 11, 12), 0))
        self.assertEqual(len(installments), 24)
        self.assertEqual(installments[-1].date, date(2026, 11, 2))

    def test_two_corrections(self):
        first = Correction(date(2026, 11, 12), euros(170000), pk=1)
        second = Correction(date(2028, 3, 3), euros(150000), pk=2)
        installments = self.mortgage(second, first)
        rate = Decimal("1.03") ** (Decimal(1) / 12) - 1
        # Installment 40 falls on 2 March 2028, before the second correction.
        self.assertEqual(installments[39].correction_id, 1)
        self.assertEqual(installments[40].correction_id, 2)
        self.assertEqual(installments[40].interest_cents, round(euros(150000) * rate))
        self.assertEqual(installments[-1].balance_after_cents, 0)

    def test_the_bank_rounds_differently(self):
        installments = self.mortgage(Correction(date(2026, 11, 12), euros(170000), payment_cents=euros(849.90)))
        self.assertEqual({i.payment_cents for i in installments[24:-1]}, {euros(849.90)})
        self.assertEqual(len(installments), 300)
        self.assertEqual(installments[-1].balance_after_cents, 0)

    def test_a_generous_payment_ends_the_loan_early(self):
        installments = compute_schedule(
            euros(1000), "6.00", 3, date(2027, 1, 31), [Correction(date(2027, 2, 15), euros(668.29), euros(700))]
        )
        self.assertEqual(
            [(i.payment_cents, i.balance_after_cents) for i in installments],
            [(euros(336.58), euros(668.29)), (euros(671.54), 0)],
        )

    def test_an_installment_on_the_correction_date_counts_before_it(self):
        installments = compute_schedule(
            euros(1000), "6.00", 3, date(2027, 1, 31), [Correction(date(2027, 2, 28), euros(500))]
        )
        self.assertEqual(installments[1].balance_after_cents, euros(334.96))
        self.assertEqual(installments[1].correction_id, None)
        self.assertEqual((installments[2].correction_id, installments[2].principal_cents), (1, euros(500)))


class LoanTestCase(TestCase):
    def setUp(self):
        self.crelan = self.account("Crelan", "checking", 5000)
        self.mortgage = self.account("Mortgage", "loan")
        self.housing = Category.objects.create(name="Housing")
        self.mortgage_category = Category.objects.create(name="Mortgage", parent=self.housing)

    def account(self, name, account_type, balance=0):
        return Account.objects.create(name=name, account_type=account_type, starting_balance_cents=euros(balance))

    def set_up(self, account=None, today=date(2026, 10, 20), principal=200000, rate="3.00", term=300,
               first=date(2026, 11, 2), paid_from=None, category=None):
        return set_up_loan(
            account or self.mortgage,
            today,
            principal_cents=euros(principal),
            annual_rate=Decimal(rate),
            term_months=term,
            first_payment_date=first,
            paid_from=paid_from or self.crelan,
            payment_category=category,
        )

    def pay(self, on, amount, account=None, payee="BNP HYPOTHEEK", **fields):
        return Transaction.objects.create(
            account=account or self.crelan, date=on, amount_cents=euros(amount), payee=payee, **fields
        )

    def balance(self, account):
        account.refresh_from_db()
        return account.current_balance_cents

    def posted(self, loan):
        """{installment: (date, value, payment id, by hand)} for the loan's
        scheduled adjustments."""
        return {
            a.loan_installment: (a.date, a.adjustment_value_cents, a.loan_payment_id, a.loan_linked_by_hand)
            for a in Transaction.objects.filter(loan=loan)
        }


class SetUpLoanTests(LoanTestCase):
    """The loan-schedules spec's "Line up at setup", "Edit a loan setup"
    and "Remove a loan setup"."""

    def test_a_loan_running_for_a_while(self):
        loan = self.set_up(today=date(2027, 2, 15), principal=1000, rate="6.00", term=3, first=date(2027, 1, 31))
        self.assertEqual(self.posted(loan), {0: (date(2027, 2, 15), euros(-668.29), None, False)})
        self.assertEqual(self.balance(self.mortgage), euros(-668.29))

    def test_a_new_loan(self):
        loan = self.set_up(today=date(2026, 11, 20), first=date(2026, 12, 2))
        self.assertEqual(self.posted(loan), {0: (date(2026, 11, 20), euros(-200000), None, False)})

    def test_the_line_up_replaces_a_value_set_that_day(self):
        set_value(self.mortgage, date(2026, 10, 20), euros(-199000))
        self.set_up()
        adjustments = Transaction.objects.filter(account=self.mortgage, is_adjustment=True, date=date(2026, 10, 20))
        self.assertEqual([a.adjustment_value_cents for a in adjustments], [euros(-200000)])
        self.assertEqual(self.balance(self.mortgage), euros(-200000))

    def test_correcting_the_rate(self):
        loan = self.set_up()
        self.pay(date(2026, 11, 2), -944.22)
        self.pay(date(2026, 12, 2), -944.22)
        sync_loan(loan, date(2026, 12, 10))
        self.assertEqual(set(self.posted(loan)), {0, 1, 2})

        loan = edit_loan(loan, date(2026, 12, 10), annual_rate=Decimal("2.90"))
        # 2.90% gives another payment, so both automatic matches go; the
        # line-up is posted again.
        self.assertNotEqual(schedule(loan)[0].payment_cents, euros(944.22))
        self.assertEqual(self.posted(loan), {0: (date(2026, 10, 20), euros(-200000), None, False)})

    def test_a_new_schedule_rematches_what_still_fits(self):
        loan = self.set_up(term=240)
        payment = schedule(Loan(principal_cents=euros(200000), annual_rate=Decimal("3.00"), term_months=300,
                                first_payment_date=date(2026, 11, 2)))[0].payment_cents
        txn = self.pay(date(2026, 11, 3), -payment / 100)
        sync_loan(loan, date(2026, 11, 10))
        self.assertEqual(set(self.posted(loan)), {0})
        edit_loan(loan, date(2026, 11, 10), term_months=300)
        self.assertEqual(self.posted(loan)[1], (date(2026, 11, 3), euros(-199549.03), txn.pk, False))

    def test_changing_the_category(self):
        loan = self.set_up()
        self.pay(date(2026, 11, 2), -944.22)
        sync_loan(loan, date(2026, 11, 10))
        before = list(Transaction.objects.filter(loan=loan).values_list("pk", flat=True).order_by("pk"))
        edit_loan(loan, date(2026, 11, 10), payment_category=self.mortgage_category)
        after = list(Transaction.objects.filter(loan=loan).values_list("pk", flat=True).order_by("pk"))
        self.assertEqual(before, after)

    def test_changing_the_paying_account_keeps_matches(self):
        loan = self.set_up()
        self.pay(date(2026, 11, 2), -944.22)
        sync_loan(loan, date(2026, 11, 10))
        savings = self.account("Savings", "savings")
        edit_loan(loan, date(2026, 11, 10), paid_from=savings)
        self.assertEqual(set(self.posted(loan)), {0, 1})

    def test_removing_the_setup(self):
        loan = self.set_up()
        self.pay(date(2026, 11, 2), -944.22)
        sync_loan(loan, date(2026, 11, 10))
        balance = self.balance(self.mortgage)
        remove_loan(loan)
        self.assertEqual(self.balance(self.mortgage), balance)
        self.assertFalse(Loan.objects.exists())
        adjustments = Transaction.objects.filter(account=self.mortgage, is_adjustment=True)
        self.assertEqual(adjustments.count(), 2)
        self.assertTrue(
            all(a.loan_id is None and a.loan_installment is None and a.loan_payment_id is None for a in adjustments)
        )


class MatchTests(LoanTestCase):
    """The loan-schedules spec's "Match an installment's payment", "Post the
    principal on a match", "Categorize the matched payment", "A payment that
    changes is unmatched" and "Matching needs no background job"."""

    def setUp(self):
        super().setUp()
        self.loan = self.set_up(category=self.mortgage_category)

    def sync(self, today=date(2026, 11, 12)):
        sync_loan(self.loan, today)

    def test_the_payment_is_booked_two_days_late(self):
        payment = self.pay(date(2026, 11, 4), -944.22)
        self.sync()
        self.assertEqual(self.posted(self.loan)[1], (date(2026, 11, 4), euros(-199549.03), payment.pk, False))

    def test_a_different_amount_doesnt_match(self):
        self.pay(date(2026, 11, 2), -944.20)
        self.sync()
        self.assertNotIn(1, self.posted(self.loan))

    def test_too_far_from_the_date(self):
        self.pay(date(2026, 11, 9), -944.22)
        self.sync(date(2026, 11, 20))
        self.assertNotIn(1, self.posted(self.loan))

    def test_an_early_payment_is_matched_ahead(self):
        payment = self.pay(date(2026, 11, 30), -944.22)
        self.pay(date(2026, 11, 2), -944.22)
        self.sync(date(2026, 11, 30))
        self.assertEqual(self.posted(self.loan)[2][2], payment.pk)

    def test_a_payment_before_setup_day_is_posted_on_it(self):
        mortgage = self.account("Mortgage B", "loan")
        payment = self.pay(date(2026, 11, 18), -944.22)
        loan = self.set_up(account=mortgage, today=date(2026, 11, 20), first=date(2026, 11, 22))
        self.assertEqual(self.posted(loan)[1], (date(2026, 11, 20), euros(-199549.03), payment.pk, False))
        self.assertEqual(self.balance(mortgage), euros(-199549.03))

    def test_two_loans_paid_from_one_account_on_the_same_day(self):
        second = self.account("Mortgage B", "loan")
        loan_b = self.set_up(account=second, principal=60000, rate="2.50", term=240)
        payment_b = schedule(loan_b)[0].payment_cents
        a = self.pay(date(2026, 11, 2), -944.22)
        b = self.pay(date(2026, 11, 2), -payment_b / 100)
        self.sync()
        sync_loan(loan_b, date(2026, 11, 12))
        self.assertEqual(self.posted(self.loan)[1][2], a.pk)
        self.assertEqual(self.posted(loan_b)[1][2], b.pk)

    def test_closest_date_wins(self):
        self.pay(date(2026, 10, 30), -944.22)
        closer = self.pay(date(2026, 11, 3), -944.22)
        self.sync()
        self.assertEqual(self.posted(self.loan)[1][2], closer.pk)

    def test_transfers_splits_and_adjustments_never_match(self):
        savings = self.account("Savings", "savings")
        transfer = self.pay(date(2026, 11, 2), -944.22)
        transfers.link_transfer(transfer, savings)
        split = self.pay(date(2026, 11, 2), -944.22)
        splits.save_split(split, [splits.SplitLine(amount_cents=euros(-500)), splits.SplitLine(amount_cents=euros(-444.22))])
        self.pay(date(2026, 11, 2), -944.22, payee="Value adjustment", is_adjustment=True,
                 adjustment_value_cents=0)
        self.sync()
        self.assertNotIn(1, self.posted(self.loan))

    def test_one_payment_never_matches_two_installments(self):
        second = self.account("Mortgage B", "loan")
        loan_b = self.set_up(account=second)
        self.pay(date(2026, 11, 2), -944.22)
        self.sync()
        sync_loan(loan_b, date(2026, 11, 12))
        self.assertIn(1, self.posted(self.loan))
        self.assertNotIn(1, self.posted(loan_b))

    def test_net_worth_drops_by_the_interest(self):
        before = self.balance(self.crelan) + self.balance(self.mortgage)
        self.pay(date(2026, 11, 4), -944.22)
        self.sync()
        self.assertEqual(self.balance(self.mortgage), euros(-199549.03))
        self.assertEqual(self.balance(self.crelan), euros(5000 - 944.22))
        self.assertEqual(self.balance(self.crelan) + self.balance(self.mortgage), before - euros(493.25))

    def test_an_uncategorized_payment(self):
        payment = self.pay(date(2026, 11, 2), -944.22)
        self.sync()
        payment.refresh_from_db()
        self.assertEqual(payment.category, self.mortgage_category)
        self.assertTrue(payment.category_confirmed)

    def test_a_guess_is_replaced(self):
        groceries = Category.objects.create(name="Groceries")
        payment = self.pay(date(2026, 11, 2), -944.22, category=groceries, category_confirmed=False,
                           category_source="history")
        self.sync()
        payment.refresh_from_db()
        self.assertEqual((payment.category, payment.category_confirmed, payment.category_source),
                         (self.mortgage_category, True, "manual"))

    def test_the_users_own_category_stays(self):
        loan_category = Category.objects.create(name="Loan", parent=self.housing)
        payment = self.pay(date(2026, 11, 2), -944.22, category=loan_category)
        self.sync()
        payment.refresh_from_db()
        self.assertEqual(payment.category, loan_category)

    def test_the_payment_is_deleted(self):
        payment = self.pay(date(2026, 11, 4), -944.22)
        self.sync()
        splits.delete_transaction(payment)
        self.assertNotIn(1, self.posted(self.loan))
        self.assertEqual(self.balance(self.mortgage), euros(-200000))

    def test_an_automatic_matchs_amount_changes(self):
        payment = self.pay(date(2026, 11, 4), -944.22)
        self.sync()
        payment.amount_cents = euros(-900)
        payment.save()
        self.sync()
        self.assertNotIn(1, self.posted(self.loan))
        self.assertEqual(self.balance(self.mortgage), euros(-200000))

    def test_a_payment_made_a_transfer_is_unmatched(self):
        payment = self.pay(date(2026, 11, 4), -944.22)
        self.sync()
        transfers.link_transfer(payment, self.account("Savings", "savings"))
        self.sync()
        self.assertNotIn(1, self.posted(self.loan))

    def test_a_payment_split_is_unmatched(self):
        payment = self.pay(date(2026, 11, 4), -944.22)
        self.sync()
        splits.save_split(payment, [splits.SplitLine(amount_cents=euros(-900)), splits.SplitLine(amount_cents=euros(-44.22))])
        self.sync()
        self.assertNotIn(1, self.posted(self.loan))

    def test_shown_twice(self):
        self.pay(date(2026, 11, 4), -944.22)
        self.sync()
        self.sync()
        self.assertEqual(Transaction.objects.filter(loan=self.loan, loan_installment=1).count(), 1)

    def test_a_second_posting_of_an_installment_is_refused(self):
        payment = self.pay(date(2026, 11, 4), -944.22)
        self.sync()
        other = self.pay(date(2026, 11, 5), -944.22)
        self.assertIsNone(_post_installment(self.loan, schedule(self.loan)[0], other))
        with self.assertRaises(IntegrityError), db_transaction.atomic():
            Transaction.objects.create(account=self.mortgage, date=date(2026, 11, 6), amount_cents=0, payee="x",
                                       is_adjustment=True, loan=self.loan, loan_installment=1)
        self.assertEqual(self.posted(self.loan)[1][2], payment.pk)


class LinkPaymentTests(LoanTestCase):
    """The loan-schedules spec's "Link a payment by hand"."""

    def setUp(self):
        super().setUp()
        self.loan = self.set_up()

    def test_booked_a_week_late(self):
        payment = self.pay(date(2026, 11, 9), -944.22)
        self.pay(date(2026, 11, 10), -50)
        sync_loan(self.loan, date(2026, 11, 12))
        self.assertEqual(link_candidates(self.loan, 1)[0], payment)
        link_payment(self.loan, 1, payment)
        self.assertEqual(self.posted(self.loan)[1], (date(2026, 11, 9), euros(-199549.03), payment.pk, True))
        self.assertEqual(self.balance(self.mortgage), euros(-199549.03))

    def test_paid_by_hand_from_savings(self):
        savings = self.account("Savings", "savings")
        payment = self.pay(date(2026, 11, 2), -944.22, account=savings)
        self.assertIn(payment, link_candidates(self.loan, 1))
        link_payment(self.loan, 1, payment)
        self.assertIn(1, self.posted(self.loan))

    def test_a_cent_off(self):
        payment = self.pay(date(2026, 11, 2), -944.21)
        self.pay(date(2026, 11, 2), -1200)
        self.assertEqual(link_candidates(self.loan, 1)[0], payment)
        link_payment(self.loan, 1, payment)
        sync_loan(self.loan, date(2026, 11, 12))
        payment.amount_cents = euros(-944.00)
        payment.save()
        sync_loan(self.loan, date(2026, 11, 12))
        self.assertEqual(self.posted(self.loan)[1][2], payment.pk)

    def test_a_hand_link_takes_the_new_balance_on_repost(self):
        payment = self.pay(date(2026, 11, 2), -944.21)
        link_payment(self.loan, 1, payment)
        loan = edit_loan(self.loan, date(2026, 11, 12), annual_rate=Decimal("2.90"))
        self.assertEqual(self.posted(loan)[1], (date(2026, 11, 2), -schedule(loan)[0].balance_after_cents, payment.pk, True))

    def test_unlink_a_wrong_choice(self):
        payment = self.pay(date(2026, 11, 2), -944.21)
        link_payment(self.loan, 1, payment)
        unlink_payment(self.loan, 1)
        self.assertNotIn(1, self.posted(self.loan))
        self.assertEqual(self.balance(self.mortgage), euros(-200000))

    def test_an_automatic_match_cant_be_unlinked(self):
        self.pay(date(2026, 11, 2), -944.22)
        sync_loan(self.loan, date(2026, 11, 12))
        with self.assertRaises(LoanError):
            unlink_payment(self.loan, 1)

    def test_rejected_links(self):
        self.pay(date(2026, 11, 2), -944.22)
        sync_loan(self.loan, date(2026, 11, 12))
        other = self.pay(date(2026, 11, 3), -944.22)
        with self.assertRaises(LoanError):  # already posted
            link_payment(self.loan, 1, other)
        old = self.set_up(account=self.account("Old", "loan"), today=date(2026, 11, 20), first=date(2026, 9, 2))
        with self.assertRaises(LoanError):  # before setup
            link_payment(old, 1, other)
        far = self.pay(date(2027, 1, 30), -944.22)
        income = self.pay(date(2026, 12, 2), 944.22)
        for txn in (far, income):
            with self.assertRaises(LoanError):  # not a candidate
                link_payment(self.loan, 2, txn)


class GuardTests(LoanTestCase):
    """The value-adjustments spec's scheduled adjustments, and the
    account-transfers spec's "A scheduled loan is not a transfer target from
    its payer"."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="budgeter", password="x"))
        self.loan = self.set_up()
        self.payment = self.pay(date(2026, 11, 4), -944.22)
        sync_loan(self.loan, date(2026, 11, 12))
        self.installment = Transaction.objects.get(loan=self.loan, loan_installment=1)

    def test_a_scheduled_adjustment_is_not_replaced(self):
        response = self.client.post(
            reverse("account-set-value", args=[self.mortgage.id]),
            {"date": "2026-11-04", "value_cents": euros(-150000)},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.installment.refresh_from_db()
        self.assertEqual(self.installment.adjustment_value_cents, euros(-199549.03))

    def test_a_scheduled_adjustment_cant_be_deleted(self):
        response = self.client.delete(reverse("transaction-detail", args=[self.installment.id]))
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Transaction.objects.filter(pk=self.installment.pk).exists())

    def test_ordinary_adjustments_can_still_be_deleted_and_replaced(self):
        house = self.account("House", "property", 300000)
        self.client.post(reverse("account-set-value", args=[house.id]), {"date": "2026-11-01", "value_cents": euros(310000)}, format="json")
        response = self.client.post(reverse("account-set-value", args=[house.id]), {"date": "2026-11-01", "value_cents": euros(305000)}, format="json")
        self.assertEqual(response.status_code, 201)
        response = self.client.delete(reverse("transaction-detail", args=[response.json()["adjustment"]["id"]]))
        self.assertEqual(response.status_code, 204)

    def test_a_scheduled_loan_is_not_a_transfer_target_from_its_payer(self):
        other = self.pay(date(2026, 11, 20), -100)
        with self.assertRaises(transfers.TransferError):
            transfers.link_transfer(other, self.mortgage)

    def test_transfers_to_a_loan_without_a_setup_still_work(self):
        car_loan = self.account("Car loan", "loan")
        other = self.pay(date(2026, 11, 20), -100)
        transfers.link_transfer(other, car_loan)
        other.refresh_from_db()
        self.assertIsNotNone(other.transfer_counterpart_id)

    def test_serialized_fields(self):
        rows = {
            row["id"]: row
            for row in self.client.get(reverse("transaction-list"), {"account": self.mortgage.id}).json()
        }
        self.assertEqual(rows[self.installment.id]["loan_installment"], 1)
        self.assertEqual(rows[self.installment.id]["loan_term_months"], 300)
        payment = self.client.get(reverse("transaction-detail", args=[self.payment.id])).json()
        self.assertEqual(
            payment["loan_match"],
            {"loan_account_id": self.mortgage.id, "loan_account_name": "Mortgage", "installment": 1},
        )
        accounts = {a["id"]: a for a in self.client.get(reverse("account-list")).json()}
        self.assertEqual((accounts[self.mortgage.id]["has_loan"], accounts[self.mortgage.id]["loan_paid_from"]),
                         (True, self.crelan.id))
        self.assertEqual((accounts[self.crelan.id]["has_loan"], accounts[self.crelan.id]["loan_paid_from"]),
                         (False, None))


class CorrectionTests(LoanTestCase):
    """The loan-schedules spec's balance corrections: "Correct a loan's
    balance", "A correction sets the loan's balance", "A correction covers
    what came before", "Remove a correction" and "Edit a loan setup"."""

    def setUp(self):
        super().setUp()
        # Installment 24 falls on 2 November 2026, leaving 188,864.23.
        self.loan = self.set_up(first=date(2024, 12, 2))

    def correct(self, on, owed, today=None, payment=None):
        return add_correction(
            self.loan, today or on, on, euros(owed), None if payment is None else euros(payment)
        )

    def correction_adjustment(self):
        return Transaction.objects.get(loan_correction__isnull=False)

    def test_the_balance_follows_the_bank(self):
        self.pay(date(2026, 11, 4), -944.22)
        sync_loan(self.loan, date(2026, 11, 12))
        self.assertEqual(self.balance(self.mortgage), euros(-188864.23))

        self.correct(date(2026, 11, 12), 170000)

        adjustment = self.correction_adjustment()
        self.assertEqual((adjustment.date, adjustment.adjustment_value_cents), (date(2026, 11, 12), euros(-170000)))
        self.assertEqual(self.balance(self.mortgage), euros(-170000))
        self.assertIn(24, self.posted(self.loan))
        self.assertEqual(schedule(self.loan)[24].payment_cents, euros(849.91))

    def test_a_correction_before_posted_installments(self):
        self.pay(date(2026, 12, 2), -944.22)
        sync_loan(self.loan, date(2026, 12, 12))
        self.assertIn(25, self.posted(self.loan))

        preview = preview_correction(self.loan, date(2026, 12, 12), date(2026, 12, 1), euros(170000))
        self.assertEqual(preview["repost"], {"installments": 1, "no_longer_matching": 1})

        self.correct(date(2026, 12, 1), 170000, today=date(2026, 12, 12))
        self.assertNotIn(25, self.posted(self.loan))

    def test_removing_a_correction(self):
        correction = self.correct(date(2026, 11, 12), 170000)
        removal = preview_removal(self.loan, correction)
        self.assertEqual(removal["payment_cents"], euros(944.22))
        self.assertEqual(removal["first_installment"], {"number": 25, "date": date(2026, 12, 2)})

        remove_correction(self.loan, correction, date(2026, 11, 12))

        self.assertFalse(Transaction.objects.filter(loan=self.loan, loan_installment__isnull=True).exists())
        self.assertEqual(schedule(self.loan)[24].payment_cents, euros(944.22))

    def test_a_correction_survives_an_edit(self):
        self.correct(date(2026, 11, 12), 170000)

        edit_loan(self.loan, date(2026, 11, 12), annual_rate=Decimal("2.90"))
        self.loan.refresh_from_db()

        adjustment = self.correction_adjustment()
        self.assertEqual((adjustment.date, adjustment.adjustment_value_cents), (date(2026, 11, 12), euros(-170000)))
        self.assertEqual(self.balance(self.mortgage), euros(-170000))
        payment = schedule(self.loan)[24].payment_cents
        self.assertNotIn(payment, (euros(849.91), euros(944.22)))

    def test_dates_that_are_refused(self):
        self.correct(date(2026, 11, 12), 170000)
        for on, today in (
            (date(2026, 11, 13), date(2026, 11, 12)),
            (date(2026, 10, 19), date(2026, 11, 12)),
            (date(2026, 11, 12), date(2026, 11, 12)),
        ):
            with self.subTest(on=on), self.assertRaises(LoanError):
                self.correct(on, 160000, today=today)
        self.assertEqual(self.loan.corrections.count(), 1)

    def test_a_negative_amount_is_refused(self):
        with self.assertRaises(LoanError):
            self.correct(date(2026, 11, 12), -1)

    def test_a_payment_that_never_repays(self):
        # 170,000.00 at 3.00% has 419.27 interest in its first month.
        with self.assertRaisesMessage(LoanError, "at least €419.28"):
            self.correct(date(2026, 11, 12), 170000, payment=400)
        self.assertFalse(self.loan.corrections.exists())

    def test_removing_the_setup_keeps_the_corrected_balance(self):
        self.correct(date(2026, 11, 12), 170000)

        remove_loan(self.loan)

        adjustment = Transaction.objects.get(account=self.mortgage, date=date(2026, 11, 12))
        self.assertEqual((adjustment.loan_id, adjustment.loan_correction_id), (None, None))
        self.assertEqual(self.balance(self.mortgage), euros(-170000))

    def test_a_late_payment_for_a_covered_installment(self):
        self.correct(date(2026, 11, 3), 170000)
        self.pay(date(2026, 11, 4), -944.22)

        sync_loan(self.loan, date(2026, 11, 12))

        posted = self.posted(self.loan)
        self.assertEqual(posted[24][0], date(2026, 11, 3))
        self.assertEqual(self.balance(self.mortgage), euros(-170000))

    def test_an_installment_after_a_correction_paid_on_its_day(self):
        self.correct(date(2026, 11, 30), 170000)
        installment = schedule(self.loan)[24]
        self.pay(date(2026, 11, 30), -installment.payment_cents / 100)

        sync_loan(self.loan, date(2026, 11, 30))

        self.assertEqual(self.posted(self.loan)[25][0], date(2026, 12, 1))
        self.assertEqual(self.balance(self.mortgage), -installment.balance_after_cents)

    def test_months_of_missed_payments(self):
        today = date(2027, 4, 12)
        self.assertEqual(missed_installment(self.loan, today).number, 29)

        self.correct(date(2027, 4, 3), 170000, today=today)

        states = {i.number: state for i, state, _ in installment_states(self.loan, today)}
        self.assertEqual({states[n] for n in range(24, 30)}, {"covered"})
        self.assertIsNone(missed_installment(self.loan, today))


class SuggestCorrectionTests(LoanTestCase):
    """The loan-schedules spec's "Suggest a correction when payments are
    missed"."""

    def setUp(self):
        super().setUp()
        # Installments of 944.22 on 2 November 2026, 2 December, 2 January...
        self.loan = self.set_up(first=date(2024, 12, 2))

    def test_the_bank_changed_the_payment(self):
        for on in (date(2026, 11, 2), date(2026, 12, 3), date(2027, 1, 2)):
            self.pay(on, -849.91)
        self.pay(date(2026, 12, 1), -50)
        self.assertEqual(
            suggest_correction(self.loan, date(2027, 2, 12)), {"missed_count": 4, "amount_cents": euros(849.91)}
        )

    def test_no_other_amount_found(self):
        self.pay(date(2026, 12, 1), -50)
        self.assertEqual(
            suggest_correction(self.loan, date(2026, 12, 12)), {"missed_count": 2, "amount_cents": None}
        )

    def test_one_miss_isnt_a_pattern(self):
        self.assertIsNone(suggest_correction(self.loan, date(2026, 11, 12)))

    def test_a_posted_installment_ends_the_run(self):
        self.pay(date(2027, 1, 2), -944.22)
        sync_loan(self.loan, date(2027, 1, 12))
        self.assertIsNone(suggest_correction(self.loan, date(2027, 1, 12)))


class SetUpWithBankBalanceTests(LoanTestCase):
    """The loan-schedules spec's "Set up with the bank's balance" and
    "Setting up with the bank's balance"."""

    terms = {
        "principal_cents": euros(160000),
        "annual_rate": Decimal("2.78"),
        "term_months": 300,
        "first_payment_date": date(2014, 12, 28),
    }

    def test_set_up_with_the_banks_balance(self):
        loan = set_up_loan(
            self.mortgage, date(2026, 10, 29), bank_balance_cents=euros(104870.35), paid_from=self.crelan, **self.terms
        )

        adjustments = Transaction.objects.filter(account=self.mortgage, date=date(2026, 10, 29))
        self.assertEqual([a.adjustment_value_cents for a in adjustments], [euros(-104870.35)])
        self.assertEqual(self.balance(self.mortgage), euros(-104870.35))

        remove_correction(loan, loan.corrections.get(), date(2026, 10, 29))

        lineup = Transaction.objects.get(account=self.mortgage, date=date(2026, 10, 29))
        self.assertEqual(lineup.loan_installment, 0)
        self.assertNotEqual(lineup.adjustment_value_cents, euros(-104870.35))

    def test_the_preview_checks_the_corrected_payment(self):
        today = date(2026, 10, 29)
        corrected = compute_schedule(
            *self.terms.values(), [type("C", (), {"date": today, "balance_cents": euros(104870.35),
                                                  "payment_cents": None, "pk": 1})()]
        )
        payment = next(i for i in corrected if i.date > today).payment_cents
        self.pay(date(2026, 9, 28), -payment / 100)

        result = preview(
            self.mortgage, today, bank_balance_cents=euros(104870.35), paid_from=self.crelan, **self.terms
        )

        self.assertEqual(result["payment_cents"], payment)
        self.assertNotEqual(result["schedule_payment_cents"], payment)
        self.assertEqual([p["date"] for p in result["found_payments"]], [date(2026, 9, 28)])

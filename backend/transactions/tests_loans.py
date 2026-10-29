from datetime import date

from django.test import SimpleTestCase

from .loans import compute_schedule


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

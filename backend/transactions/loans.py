"""Loan schedules: a loan account's annuity schedule, computed from its
terms, and the value adjustments that post each installment once its
payment is seen. See openspec/specs/loan-schedules.

The schedule is never stored. What is stored are the adjustments the
schedule posted: the line-up at setup (installment 0) and one per matched
installment, each holding the schedule's balance after it. Because an
adjustment holds an absolute value, a missed month heals at the next
match.
"""

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta


@dataclass(frozen=True)
class Installment:
    number: int
    date: date
    payment_cents: int
    interest_cents: int
    principal_cents: int
    balance_after_cents: int


def _cents(value):
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def monthly_rate(annual_rate):
    """The Belgian equivalent monthly rate for an annual percentage:
    (1 + r)^(1/12) - 1, not r / 12."""
    return (1 + Decimal(annual_rate) / 100) ** (Decimal(1) / 12) - 1


def installment_date(first_payment_date, number):
    # Counted from the first date, not chained, so 31 Jan gives 28 Feb and
    # then 31 Mar.
    return first_payment_date + relativedelta(months=number - 1)


def compute_schedule(principal_cents, annual_rate, term_months, first_payment_date):
    """Every installment of an annuity loan, rounded to the cent half up;
    the last one repays what rounding left."""
    rate = monthly_rate(annual_rate)
    if rate == 0:
        payment = _cents(Decimal(principal_cents) / term_months)
    else:
        payment = _cents(principal_cents * rate / (1 - (1 + rate) ** -term_months))
    balance = principal_cents
    installments = []
    for number in range(1, term_months + 1):
        interest = _cents(balance * rate)
        principal = balance if number == term_months else payment - interest
        balance -= principal
        installments.append(
            Installment(
                number=number,
                date=installment_date(first_payment_date, number),
                payment_cents=interest + principal,
                interest_cents=interest,
                principal_cents=principal,
                balance_after_cents=balance,
            )
        )
    return installments


def schedule(loan):
    return compute_schedule(loan.principal_cents, loan.annual_rate, loan.term_months, loan.first_payment_date)

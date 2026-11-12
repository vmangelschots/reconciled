"""A loan category's bills: one per installment of each loan paying into
it - see openspec/specs/bill-budgets. Computed from the loans' schedules and
their matches every time, never stored, so corrections and edits show at
once. The rules are the schedule page's (transactions/loans.py
installment_states): before the setup day and covered installments aren't
bills, a posted one is paid by its payment; the rest follow bills.bill_state.
"""

from transactions.loans import schedule
from transactions.models import Transaction

from .bills import as_of, bill_state
from .loan_categories import active_loans
from .utils import month_range


def loan_lines(month, today):
    """{category id: [bill line]} for `month`, as of today for the current
    month and the month's last day for a past one. Three queries, however
    many loans."""
    loans = list(
        active_loans().exclude(payment_category=None).select_related("account").prefetch_related("corrections")
    )
    if not loans:
        return {}
    posted = {
        (a.loan_id, a.loan_installment): a.loan_payment
        for a in Transaction.objects.filter(loan__in=loans, loan_installment__isnull=False).select_related(
            "loan_payment"
        )
    }
    ref_day, month_over, future = as_of(month, today)
    end = month_range(month)
    result = {}
    for loan in sorted(loans, key=lambda l: l.account.name):
        corrections = list(loan.corrections.all())
        covered_until = max((c.date for c in corrections), default=None)
        for installment in schedule(loan):
            if installment.date < month:
                continue
            if installment.date >= end:
                break
            if installment.date < loan.setup_date:
                continue
            payment = posted.get((loan.pk, installment.number))
            if payment is None and covered_until is not None and installment.date <= covered_until:
                continue
            if payment is not None:
                state = "paid"
            else:
                state = bill_state(installment.payment_cents, installment.date, None, ref_day, month_over, future)
            result.setdefault(loan.payment_category_id, []).append(
                {
                    "id": f"loan-{loan.account_id}-{installment.number}",
                    "name": loan.account.name,
                    "day": installment.date.day,
                    "due_date": installment.date,
                    "amount_cents": installment.payment_cents,
                    "state": state,
                    # A hand link may point at a payment of another amount.
                    "paid_on": payment.date if payment is not None else None,
                    "paid_cents": -payment.amount_cents if payment is not None else None,
                    "difference_cents": None,
                    "source": "loan",
                    "loan_account_id": loan.account_id,
                }
            )
    return result

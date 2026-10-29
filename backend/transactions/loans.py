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
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from dateutil.relativedelta import relativedelta
from django.db import IntegrityError
from django.db import transaction as db_transaction

from accounts.models import Account, Loan

from .adjustments import ADJUSTMENT_PAYEE
from .models import Transaction
from .transfers import TRANSFER_MATCH_DAYS


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


# How far, in days either way, a payment may be booked from its
# installment and still match on its own - the same window as transfers.
MATCH_DAYS = TRANSFER_MATCH_DAYS
# How far "Link payment" looks.
LINK_DAYS = 15
MAX_TERM_MONTHS = 600


class LoanError(ValueError):
    """The loan can't be set up, edited or linked as asked."""


def check_terms(account, principal_cents, annual_rate, term_months, paid_from):
    """Raise LoanError when these terms can't be a loan setup on `account`."""
    if account.account_type != Account.AccountType.LOAN:
        raise LoanError("Only a loan account can have a loan schedule.")
    if account.archived:
        raise LoanError("An archived loan can't be set up.")
    if principal_cents <= 0:
        raise LoanError("The amount borrowed must be more than zero.")
    if annual_rate < 0:
        raise LoanError("The rate can't be negative.")
    if not 1 <= term_months <= MAX_TERM_MONTHS:
        raise LoanError(f"The term must be between 1 and {MAX_TERM_MONTHS} months.")
    if paid_from.pk == account.pk or paid_from.account_type == Account.AccountType.LOAN:
        raise LoanError("A loan is paid from another account that isn't a loan.")
    if paid_from.archived:
        raise LoanError("A loan can't be paid from an archived account.")


def lineup_value(installments, principal_cents, setup_date):
    """What the loan is worth on setup day: minus the balance after the
    last installment before it, or minus the amount borrowed."""
    before = [i for i in installments if i.date < setup_date]
    return -(before[-1].balance_after_cents if before else principal_cents)


def _posting_date(loan, payment):
    # A payment can be booked a few days before its installment, and so
    # before setup day; dated earlier, the line-up would overwrite it.
    return max(payment.date, loan.setup_date)


def _post_lineup(loan, installments):
    # An ordinary adjustment on setup day is replaced, as Set value does.
    Transaction.objects.filter(
        account_id=loan.account_id, is_adjustment=True, date=loan.setup_date, loan__isnull=True
    ).delete()
    Transaction.objects.create(
        account_id=loan.account_id,
        date=loan.setup_date,
        amount_cents=0,
        payee=ADJUSTMENT_PAYEE,
        is_adjustment=True,
        adjustment_value_cents=lineup_value(installments, loan.principal_cents, loan.setup_date),
        loan=loan,
        loan_installment=0,
    )


def _categorize_payment(loan, payment):
    """A matched payment without a category, or with only a guess, gets the
    loan's payment category - confirmed, since an exact match on the named
    account is stronger evidence than a guess."""
    if loan.payment_category_id is None:
        return
    if payment.category_id is not None and payment.category_confirmed:
        return
    payment.category_id = loan.payment_category_id
    payment.category_confirmed = True
    payment.category_source = Transaction.CategorySource.MANUAL
    payment.category_reason = ""
    payment.save(update_fields=["category", "category_confirmed", "category_source", "category_reason", "updated_at"])


def _post_installment(loan, installment, payment, by_hand=False):
    """Post `installment` as paid by `payment`. Returns the adjustment, or
    None when it was already posted (a concurrent sync got there first)."""
    try:
        with db_transaction.atomic():
            adjustment = Transaction.objects.create(
                account_id=loan.account_id,
                date=_posting_date(loan, payment),
                amount_cents=0,
                payee=ADJUSTMENT_PAYEE,
                is_adjustment=True,
                adjustment_value_cents=-installment.balance_after_cents,
                loan=loan,
                loan_installment=installment.number,
                loan_payment=payment,
                loan_linked_by_hand=by_hand,
            )
    except IntegrityError:
        return None
    _categorize_payment(loan, payment)
    return adjustment


def payment_rows():
    """Rows that can be an installment's payment: bank lines that aren't
    transfers, split transactions, adjustments or another installment's
    payment."""
    return (
        Transaction.objects.counted_rows()
        .ledger_rows()
        .excluding_adjustments()
        .filter(transfer_counterpart__isnull=True, loan_adjustment__isnull=True)
    )


def _find_payment(loan, installment):
    window = timedelta(days=MATCH_DAYS)
    candidates = (
        payment_rows()
        .filter(
            account_id=loan.paid_from_id,
            amount_cents=-installment.payment_cents,
            date__gte=installment.date - window,
            date__lte=installment.date + window,
        )
    )
    # Closest date wins; the lowest id breaks ties so the choice is stable.
    return min(candidates, key=lambda c: (abs((c.date - installment.date).days), c.pk), default=None)


def _is_stale(adjustment, installment):
    payment = adjustment.loan_payment
    if installment is None or payment.transfer_counterpart_id is not None or payment.parts.exists():
        return True
    # A transaction can't change account, so only the amount can drift.
    # A hand link was chosen knowing the amount, so it survives that.
    return not adjustment.loan_linked_by_hand and payment.amount_cents != -installment.payment_cents


@db_transaction.atomic
def sync_loan(loan, today):
    """Bring one loan's posted installments up to date: drop matches whose
    payment no longer fits, then match every due installment since setup
    (up to MATCH_DAYS ahead, as payments can come early)."""
    # Serializes concurrent syncs of the same loan; the unique constraint
    # is the backstop.
    loan = Loan.objects.select_for_update().get(pk=loan.pk)
    installments = schedule(loan)
    by_number = {i.number: i for i in installments}
    posted = {}
    for adjustment in loan.adjustments.select_related("loan_payment"):
        if adjustment.loan_payment_id is not None and _is_stale(
            adjustment, by_number.get(adjustment.loan_installment)
        ):
            adjustment.delete()
        else:
            posted[adjustment.loan_installment] = adjustment
    horizon = today + timedelta(days=MATCH_DAYS)
    for installment in installments:
        if installment.date < loan.setup_date or installment.number in posted:
            continue
        if installment.date > horizon:
            break
        payment = _find_payment(loan, installment)
        if payment is not None:
            _post_installment(loan, installment, payment)


def sync_loans(today):
    """sync_loan for every loan on an active account."""
    for loan in Loan.objects.filter(account__archived=False):
        sync_loan(loan, today)


@db_transaction.atomic
def set_up_loan(account, today, **terms):
    """Give `account` its loan terms, line it up on `today` and match what
    is already due. Returns the loan."""
    if Loan.objects.filter(account=account).exists():
        raise LoanError("This loan is already set up.")
    loan = Loan.objects.create(account=account, setup_date=today, **terms)
    _post_lineup(loan, schedule(loan))
    sync_loan(loan, today)
    return loan


SCHEDULE_TERMS = ("principal_cents", "annual_rate", "term_months", "first_payment_date")


def changes_schedule(loan, terms):
    """Whether these terms give a different schedule than the loan's."""
    return any(field in terms and terms[field] != getattr(loan, field) for field in SCHEDULE_TERMS)


@db_transaction.atomic
def edit_loan(loan, today, **terms):
    """Change a loan's terms. A new category or paying account keeps every
    match; a new schedule reposts: automatic postings (the line-up
    included) go, hand links take the new balances, and what is due is
    matched again."""
    loan = Loan.objects.select_for_update().get(pk=loan.pk)
    repost = changes_schedule(loan, terms)
    for field, value in terms.items():
        setattr(loan, field, value)
    loan.save()
    if repost:
        loan.adjustments.filter(loan_linked_by_hand=False).delete()
        installments = schedule(loan)
        _post_lineup(loan, installments)
        by_number = {i.number: i for i in installments}
        for adjustment in loan.adjustments.filter(loan_linked_by_hand=True):
            installment = by_number.get(adjustment.loan_installment)
            if installment is None:
                adjustment.delete()
            else:
                adjustment.adjustment_value_cents = -installment.balance_after_cents
                adjustment.save(update_fields=["adjustment_value_cents", "updated_at"])
    sync_loan(loan, today)
    return loan


@db_transaction.atomic
def remove_loan(loan):
    """Remove a loan's setup. Its posted adjustments stay as ordinary ones,
    so the balance doesn't move."""
    loan.adjustments.update(loan_installment=None, loan_payment=None, loan_linked_by_hand=False)
    loan.delete()


def _unposted_installment(loan, number):
    """The installment `number`, if it can still be linked by hand."""
    installment = next((i for i in schedule(loan) if i.number == number), None)
    if installment is None:
        raise LoanError("This loan has no such installment.")
    if installment.date < loan.setup_date:
        raise LoanError("Installments before the setup aren't posted.")
    if loan.adjustments.filter(loan_installment=number).exists():
        raise LoanError("This installment is already posted.")
    return installment


def link_candidates(loan, number):
    """Outflows that could be installment `number`'s payment, for "Link
    payment": within LINK_DAYS in any active account that isn't a loan,
    closest amount first, then closest date."""
    installment = _unposted_installment(loan, number)
    window = timedelta(days=LINK_DAYS)
    rows = (
        payment_rows()
        .select_related("account")
        .filter(
            amount_cents__lt=0,
            account__archived=False,
            date__gte=installment.date - window,
            date__lte=installment.date + window,
        )
        .exclude(account__account_type=Account.AccountType.LOAN)
    )
    return sorted(
        rows,
        key=lambda t: (
            abs(t.amount_cents + installment.payment_cents),
            abs((t.date - installment.date).days),
            t.pk,
        ),
    )


@db_transaction.atomic
def link_payment(loan, number, payment):
    """Post installment `number` as paid by `payment`, chosen by hand."""
    loan = Loan.objects.select_for_update().get(pk=loan.pk)
    if payment not in link_candidates(loan, number):
        raise LoanError("That transaction can't be this installment's payment.")
    installment = _unposted_installment(loan, number)
    return _post_installment(loan, installment, payment, by_hand=True)


@db_transaction.atomic
def unlink_payment(loan, number):
    """Undo a hand link. An automatic match isn't undone here - it would
    match again on the next read."""
    adjustment = loan.adjustments.filter(loan_installment=number, loan_linked_by_hand=True).first()
    if adjustment is None:
        raise LoanError("Only a payment linked by hand can be unlinked.")
    adjustment.delete()

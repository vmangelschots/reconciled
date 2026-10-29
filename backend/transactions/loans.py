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

from accounts.models import Account, Loan, LoanCorrection

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
    # The balance correction this installment's stretch runs from, if any.
    correction_id: int | None = None


def _cents(value):
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _annuity(balance_cents, rate, installments):
    if rate == 0:
        return _cents(Decimal(balance_cents) / installments)
    return _cents(balance_cents * rate / (1 - (1 + rate) ** -installments))


def monthly_rate(annual_rate):
    """The Belgian equivalent monthly rate for an annual percentage:
    (1 + r)^(1/12) - 1, not r / 12."""
    return (1 + Decimal(annual_rate) / 100) ** (Decimal(1) / 12) - 1


def installment_date(first_payment_date, number):
    # Counted from the first date, not chained, so 31 Jan gives 28 Feb and
    # then 31 Mar.
    return first_payment_date + relativedelta(months=number - 1)


def compute_schedule(principal_cents, annual_rate, term_months, first_payment_date, corrections=()):
    """Every installment of an annuity loan, rounded to the cent half up;
    the last one repays what rounding left.

    A correction (anything with date, balance_cents, payment_cents and pk)
    restarts the schedule at the first installment dated after it: from
    its balance, with its payment or the annuity over the installments
    left. One of 0.00 ends the loan there, and a payment generous enough
    to repay early ends it at the installment that reaches 0.00."""
    rate = monthly_rate(annual_rate)
    payment = _annuity(principal_cents, rate, term_months)
    balance = principal_cents
    pending = sorted(corrections, key=lambda c: c.date)
    correction_id = None
    installments = []
    for number in range(1, term_months + 1):
        on = installment_date(first_payment_date, number)
        # An installment on a correction's date counts as before it; of
        # several corrections since the last installment, the latest wins.
        restart = None
        while pending and pending[0].date < on:
            restart = pending.pop(0)
        if restart is not None:
            balance = restart.balance_cents
            correction_id = restart.pk
            if balance > 0:
                payment = (
                    restart.payment_cents
                    if restart.payment_cents is not None
                    else _annuity(balance, rate, term_months - number + 1)
                )
        if balance <= 0:
            break
        interest = _cents(balance * rate)
        principal = balance if number == term_months else min(payment - interest, balance)
        balance -= principal
        installments.append(
            Installment(
                number=number,
                date=on,
                payment_cents=interest + principal,
                interest_cents=interest,
                principal_cents=principal,
                balance_after_cents=balance,
                correction_id=correction_id,
            )
        )
    return installments


def schedule(loan):
    return compute_schedule(
        loan.principal_cents,
        loan.annual_rate,
        loan.term_months,
        loan.first_payment_date,
        # An unsaved loan (a preview) has no corrections yet.
        list(loan.corrections.all()) if loan.pk else [],
    )


# How far, in days either way, a payment may be booked from its
# installment and still match on its own - the same window as transfers.
MATCH_DAYS = TRANSFER_MATCH_DAYS
# How far "Link payment" looks.
LINK_DAYS = 15
MAX_TERM_MONTHS = 600


class LoanError(ValueError):
    """The loan can't be set up, edited or linked as asked."""


def on_day(day):
    """2026-11-12 -> "12 Nov 2026", for messages."""
    return f"{day.day} {day:%b %Y}"


def euro(cents):
    """94422 -> "€944.22", for messages."""
    return f"€{cents / 100:,.2f}"


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


def lineup_value(installments, principal_cents, setup_date, corrections=()):
    """What the loan is worth on setup day: minus the balance after the
    last installment or correction before it, whichever is later (the
    correction on a tie, as an installment on its date counts before it),
    or minus the amount borrowed."""
    before = [i for i in installments if i.date < setup_date]
    corrected = max((c for c in corrections if c.date < setup_date), key=lambda c: c.date, default=None)
    if corrected is not None and (not before or corrected.date >= before[-1].date):
        return -corrected.balance_cents
    return -(before[-1].balance_after_cents if before else principal_cents)


# How far before the setup day a correction may be dated: a bank's figure
# often predates the latest installment by a few days.
CORRECTION_LOOKBACK = relativedelta(months=1)


def _posting_date(loan, payment, installment, corrections):
    """The date an installment's adjustment is posted on: its payment's.
    A payment can be booked a few days before its installment, and so
    before setup day; dated earlier, the line-up would overwrite it. Around
    a correction, which is the last adjustment on its date, an installment
    on or before it posts no later than it, so a late payment can't move
    the balance from the bank's figure, and one after it posts no earlier
    than the next day, so the correction can't hide it."""
    on = max(payment.date, loan.setup_date)
    before = [c.date for c in corrections if c.date < installment.date]
    if before:
        on = max(on, max(before) + timedelta(days=1))
    covering = [c.date for c in corrections if c.date >= installment.date]
    if covering:
        on = min(on, min(covering))
    return on


def _replace_ordinary_adjustment(loan, on):
    # An ordinary adjustment on a scheduled day is replaced, as Set value does.
    Transaction.objects.filter(account_id=loan.account_id, is_adjustment=True, date=on, loan__isnull=True).delete()


def _post_lineup(loan, installments):
    """The setup day's value, unless a correction that day takes its
    place."""
    if loan.corrections.filter(date=loan.setup_date).exists():
        return
    _replace_ordinary_adjustment(loan, loan.setup_date)
    Transaction.objects.create(
        account_id=loan.account_id,
        date=loan.setup_date,
        amount_cents=0,
        payee=ADJUSTMENT_PAYEE,
        is_adjustment=True,
        adjustment_value_cents=lineup_value(
            installments, loan.principal_cents, loan.setup_date, list(loan.corrections.all())
        ),
        loan=loan,
        loan_installment=0,
    )


def _post_correction(loan, correction):
    # One dated before setup posts nothing itself: the line-up follows it.
    if correction.date < loan.setup_date:
        return
    _replace_ordinary_adjustment(loan, correction.date)
    Transaction.objects.create(
        account_id=loan.account_id,
        date=correction.date,
        amount_cents=0,
        payee=ADJUSTMENT_PAYEE,
        is_adjustment=True,
        adjustment_value_cents=-correction.balance_cents,
        loan=loan,
        loan_correction=correction,
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


def _post_installment(loan, installment, payment, by_hand=False, corrections=None):
    """Post `installment` as paid by `payment`. Returns the adjustment, or
    None when it was already posted (a concurrent sync got there first)."""
    if corrections is None:
        corrections = list(loan.corrections.all())
    try:
        with db_transaction.atomic():
            adjustment = Transaction.objects.create(
                account_id=loan.account_id,
                date=_posting_date(loan, payment, installment, corrections),
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
    corrections = list(loan.corrections.all())
    installments = schedule(loan)
    by_number = {i.number: i for i in installments}
    posted = {}
    for adjustment in loan.adjustments.filter(loan_installment__isnull=False).select_related("loan_payment"):
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
            _post_installment(loan, installment, payment, corrections=corrections)


def sync_loans(today):
    """sync_loan for every loan on an active account."""
    for loan in Loan.objects.filter(account__archived=False):
        sync_loan(loan, today)


def _check_bank_balance(today, bank_balance_cents, bank_balance_date):
    if bank_balance_cents is not None and bank_balance_cents < 0:
        raise LoanError("Enter what you owe, 0.00 or more.")
    if bank_balance_date is not None:
        _check_correction_date(today, today, bank_balance_date)


@db_transaction.atomic
def set_up_loan(account, today, bank_balance_cents=None, bank_balance_date=None, **terms):
    """Give `account` its loan terms, line it up on `today` and match what
    is already due. With what the bank says is owed (today, or on a day up
    to a month back), the setup gets a correction of it, which the line-up
    follows. Returns the loan."""
    if Loan.objects.filter(account=account).exists():
        raise LoanError("This loan is already set up.")
    _check_bank_balance(today, bank_balance_cents, bank_balance_date)
    loan = Loan.objects.create(account=account, setup_date=today, **terms)
    if bank_balance_cents is not None:
        correction = LoanCorrection.objects.create(
            loan=loan, date=bank_balance_date or today, balance_cents=bank_balance_cents
        )
        _post_correction(loan, correction)
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
        _repost(loan, today)
    else:
        sync_loan(loan, today)
    return loan


def _repost(loan, today):
    """Post the loan again from its schedule: automatic postings (the
    line-up and corrections included) go; then the line-up, each
    correction, the hand links at their new balances and dates, and a
    match for what is due."""
    loan.adjustments.filter(loan_linked_by_hand=False).delete()
    corrections = list(loan.corrections.all())
    installments = schedule(loan)
    _post_lineup(loan, installments)
    for correction in corrections:
        _post_correction(loan, correction)
    by_number = {i.number: i for i in installments}
    for adjustment in loan.adjustments.filter(loan_linked_by_hand=True).select_related("loan_payment"):
        installment = by_number.get(adjustment.loan_installment)
        if installment is None:
            adjustment.delete()
        else:
            adjustment.adjustment_value_cents = -installment.balance_after_cents
            adjustment.date = _posting_date(loan, adjustment.loan_payment, installment, corrections)
            adjustment.save(update_fields=["adjustment_value_cents", "date", "updated_at"])
    sync_loan(loan, today)


def repost_effect(loan, installments, after=None):
    """What reposting along `installments` would do to the posted
    installments dated after `after` (all of them when None): how many are
    reposted, and how many automatic matches would no longer match."""
    by_number = {i.number: i for i in installments}
    current = {i.number: i for i in schedule(loan)}
    matched = [
        a
        for a in loan.adjustments.filter(loan_payment__isnull=False).select_related("loan_payment")
        if after is None or current[a.loan_installment].date > after
    ]
    return {
        "installments": len(matched),
        "no_longer_matching": sum(
            1
            for a in matched
            if not a.loan_linked_by_hand
            and (
                a.loan_installment not in by_number
                or a.loan_payment.amount_cents != -by_number[a.loan_installment].payment_cents
            )
        ),
    }


@db_transaction.atomic
def remove_loan(loan):
    """Remove a loan's setup. Its posted adjustments stay as ordinary ones,
    so the balance doesn't move."""
    loan.adjustments.update(
        loan_installment=None, loan_payment=None, loan_linked_by_hand=False, loan_correction=None
    )
    loan.delete()


@dataclass(frozen=True)
class _Candidate:
    """A correction not saved yet, for checking and previewing it."""

    date: date
    balance_cents: int
    payment_cents: int | None
    pk: str = "new"


def _with_candidate(loan, candidate, without=None):
    """The loan's schedule with `candidate` added and/or `without` left out."""
    corrections = [c for c in loan.corrections.all() if c != without]
    if candidate is not None:
        corrections.append(candidate)
    return compute_schedule(
        loan.principal_cents, loan.annual_rate, loan.term_months, loan.first_payment_date, corrections
    )


def _check_correction_date(today, setup_date, on):
    if on > today:
        raise LoanError("The date can't be in the future.")
    earliest = setup_date - CORRECTION_LOOKBACK
    if on < earliest:
        raise LoanError(
            f"The date can't be before {on_day(earliest)}, a month before the setup day. Edit the terms instead."
        )


def _check_correction(loan, today, on, balance_cents, payment_cents):
    """Raise LoanError when this can't be a correction of `loan`; else the
    schedule it gives."""
    _check_correction_date(today, loan.setup_date, on)
    if loan.corrections.filter(date=on).exists():
        raise LoanError(f"There's already a correction on {on_day(on)}. Remove it first.")
    if balance_cents < 0:
        raise LoanError("Enter what you owe, 0.00 or more.")
    if payment_cents is not None and balance_cents > 0:
        lowest = _cents(balance_cents * monthly_rate(loan.annual_rate)) + 1
        if payment_cents < lowest:
            raise LoanError(f"The payment must be at least {euro(lowest)} to cover the interest.")
    return _with_candidate(loan, _Candidate(on, balance_cents, payment_cents))


@db_transaction.atomic
def add_correction(loan, today, on, balance_cents, payment_cents=None):
    """Record what the bank says is owed at the end of `on`, and repost the
    schedule from it. Returns the correction."""
    loan = Loan.objects.select_for_update().get(pk=loan.pk)
    if balance_cents == 0:
        payment_cents = None
    _check_correction(loan, today, on, balance_cents, payment_cents)
    correction = LoanCorrection.objects.create(
        loan=loan, date=on, balance_cents=balance_cents, payment_cents=payment_cents
    )
    _repost(loan, today)
    return correction


@db_transaction.atomic
def remove_correction(loan, correction, today):
    """Drop a correction and its adjustment, and repost without it."""
    loan = Loan.objects.select_for_update().get(pk=loan.pk)
    Transaction.objects.filter(loan_correction=correction).delete()
    correction.delete()
    _repost(loan, today)


def _payment_from(installments, on):
    """The first installment after `on`, or None when the loan has ended."""
    return next((i for i in installments if i.date > on), None)


def _found_payments(account_id, payment_cents, today):
    return list(
        payment_rows()
        .filter(
            account_id=account_id,
            amount_cents=-payment_cents,
            date__gt=today - timedelta(days=90),
            date__lte=today,
        )
        .order_by("-date", "-id")[:3]
    )


# How far from the payment the correction form still offers an amount the
# paying account paid - a rounding difference with the bank.
NEAR_PAYMENT_CENTS = 5


def _near_payment(account_id, payment_cents, today):
    """The paying account's outflow within NEAR_PAYMENT_CENTS of the payment
    in the last 90 days, closest amount then latest date, or None."""
    rows = (
        payment_rows()
        .filter(
            account_id=account_id,
            amount_cents__gte=-payment_cents - NEAR_PAYMENT_CENTS,
            amount_cents__lte=-payment_cents + NEAR_PAYMENT_CENTS,
            date__gt=today - timedelta(days=90),
            date__lte=today,
        )
        .exclude(amount_cents=-payment_cents)
    )
    return min(rows, key=lambda t: (abs(t.amount_cents + payment_cents), -t.date.toordinal(), -t.pk), default=None)


def _payment_info(payment):
    return {"id": payment.id, "date": payment.date, "payee": payment.payee, "amount_cents": payment.amount_cents}


def preview_correction(loan, today, on, balance_cents, payment_cents=None):
    """What this correction would give, saving nothing - see the spec's
    "Check a correction before saving"."""
    if balance_cents == 0:
        payment_cents = None
    installments = _check_correction(loan, today, on, balance_cents, payment_cents)
    current = schedule(loan)
    before = [i for i in current if i.date <= on]
    schedule_balance = before[-1].balance_after_cents if before else loan.principal_cents
    previous = _payment_from(current, on)
    first = _payment_from(installments, on)
    result = {
        "paid_off": first is None,
        "payment_cents": first.payment_cents if first else None,
        "previous_payment_cents": previous.payment_cents if previous else None,
        "first_installment": {"number": first.number, "date": first.date} if first else None,
        "installments_left": sum(1 for i in installments if i.date > on),
        "last_payment_cents": installments[-1].payment_cents if first else None,
        "end_date": installments[-1].date if first else on,
        "schedule_balance_cents": schedule_balance,
        "difference_cents": balance_cents - schedule_balance,
        "found_payments": [],
        "near_payment": None,
        "repost": repost_effect(loan, installments, after=on),
    }
    if first is not None:
        found = _found_payments(loan.paid_from_id, first.payment_cents, today)
        result["found_payments"] = [_payment_info(t) for t in found]
        if not found:
            near = _near_payment(loan.paid_from_id, first.payment_cents, today)
            result["near_payment"] = _payment_info(near) if near else None
    return result


def preview_removal(loan, correction):
    """What removing `correction` would do: the payment from the next
    installment on without it, and the repost."""
    installments = _with_candidate(loan, None, without=correction)
    first = _payment_from(installments, correction.date)
    return {
        "payment_cents": first.payment_cents if first else None,
        "first_installment": {"number": first.number, "date": first.date} if first else None,
        "repost": repost_effect(loan, installments, after=correction.date),
    }


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


# An installment's state on the schedule page; see the spec's "Schedule
# table".
BEFORE_SETUP, POSTED, COVERED, DUE, MISSED, UPCOMING = (
    "before_setup",
    "posted",
    "covered",
    "due",
    "missed",
    "upcoming",
)


def _covered_until(loan):
    """The latest correction's date: an unposted installment on or before
    it is covered by the bank's figure, never missed."""
    latest = loan.corrections.order_by("-date").first()
    return latest.date if latest else None


def is_missed(installment, today):
    return (today - installment.date).days > MATCH_DAYS


def installment_states(loan, today):
    """[(installment, state, adjustment or None)] for the whole schedule.
    Only the first unposted installment that isn't missed is due."""
    adjustments = {
        a.loan_installment: a
        for a in loan.adjustments.filter(loan_installment__isnull=False).select_related("loan_payment__account")
    }
    covered_until = _covered_until(loan)
    rows = []
    due_found = False
    for installment in schedule(loan):
        adjustment = adjustments.get(installment.number)
        if installment.date < loan.setup_date:
            state = BEFORE_SETUP
        elif adjustment is not None:
            state = POSTED
        elif covered_until is not None and installment.date <= covered_until:
            state = COVERED
        elif is_missed(installment, today):
            state = MISSED
        elif not due_found:
            state, due_found = DUE, True
        else:
            state = UPCOMING
        rows.append((installment, state, adjustment))
    return rows


def missed_installment(loan, today):
    """The installment to flag in Needs attention: the latest one more than
    MATCH_DAYS past its date and on or after setup, if it has no payment
    and no correction covers it. A later match clears an earlier miss."""
    latest = None
    for installment in schedule(loan):
        if installment.date < loan.setup_date:
            continue
        if not is_missed(installment, today):
            break
        latest = installment
    if latest is None or loan.adjustments.filter(loan_installment=latest.number).exists():
        return None
    covered_until = _covered_until(loan)
    if covered_until is not None and latest.date <= covered_until:
        return None
    return latest


def suggest_correction(loan, today):
    """What the schedule page's banner says, or None: when the latest two or
    more installments since setup are missed, how many, and the one other
    amount the paying account paid near at least two of them - see the
    spec's "Suggest a correction when payments are missed"."""
    past = [(i, state) for i, state, _ in installment_states(loan, today) if state in (POSTED, COVERED, MISSED)]
    missed = []
    for installment, state in reversed(past):
        if state != MISSED:
            break
        missed.append(installment)
    if len(missed) < 2:
        return None
    window = timedelta(days=MATCH_DAYS)
    seen_at = {}
    for installment in missed:
        amounts = (
            payment_rows()
            .filter(
                account_id=loan.paid_from_id,
                amount_cents__lt=0,
                date__gte=installment.date - window,
                date__lte=installment.date + window,
            )
            .exclude(amount_cents=-installment.payment_cents)
            .values_list("amount_cents", flat=True)
        )
        for amount in set(amounts):
            seen_at[amount] = seen_at.get(amount, 0) + 1
    repeated = [(count, amount) for amount, count in seen_at.items() if count >= 2]
    # Most installments first; of equals, the amount closest to the payment.
    payment = missed[0].payment_cents
    best = min(repeated, key=lambda r: (-r[0], abs(-r[1] - payment)), default=None)
    return {"missed_count": len(missed), "amount_cents": -best[1] if best else None}


def preview(account, today, loan=None, bank_balance_cents=None, bank_balance_date=None, **terms):
    """What these terms would give, saving nothing: the monthly payment, the
    next installment, the schedule's balance today, recent payments of that
    amount in the paying account, and for an existing setup, what an edit
    would repost. With what the bank says is owed (a new setup only), the
    payment is the one that correction gives."""
    corrections = list(loan.corrections.all()) if loan is not None else []
    bank_date = bank_balance_date or today
    if loan is None and bank_balance_cents is not None:
        _check_bank_balance(today, bank_balance_cents, bank_balance_date)
        corrections.append(_Candidate(bank_date, bank_balance_cents, None))
    installments = compute_schedule(
        terms["principal_cents"],
        terms["annual_rate"],
        terms["term_months"],
        terms["first_payment_date"],
        # An edit keeps the loan's corrections.
        corrections,
    )
    if not installments:
        raise LoanError("The bank says nothing is owed: there's no schedule left to follow.")
    payment_cents = installments[0].payment_cents
    corrected_from = _payment_from(installments, bank_date) if bank_balance_cents is not None else None
    if corrected_from is not None:
        payment_cents = corrected_from.payment_cents
    found = (
        payment_rows()
        .filter(
            account=terms["paid_from"],
            amount_cents=-payment_cents,
            date__gt=today - timedelta(days=90),
            date__lte=today,
        )
        .order_by("-date", "-id")[:3]
    )
    next_installment = next((i for i in installments if i.date >= today), None)
    result = {
        "payment_cents": payment_cents,
        "schedule_payment_cents": installments[0].payment_cents,
        "last_payment_cents": installments[-1].payment_cents,
        "end_date": installments[-1].date,
        "next_installment": (
            {"number": next_installment.number, "date": next_installment.date} if next_installment else None
        ),
        "schedule_balance_today_cents": lineup_value(installments, terms["principal_cents"], today, corrections),
        "current_balance_cents": account.current_balance_cents,
        "found_payments": [_payment_info(t) for t in found],
        "repost": None,
    }
    if loan is not None and changes_schedule(loan, terms):
        result["repost"] = repost_effect(loan, installments)
    return result

from datetime import timedelta

from dateutil.relativedelta import relativedelta

from transactions.loans import schedule

_STEP = {
    "weekly": lambda d: d + timedelta(weeks=1),
    "biweekly": lambda d: d + timedelta(weeks=2),
    "monthly": lambda d: d + relativedelta(months=1),
    "yearly": lambda d: d + relativedelta(years=1),
}


def expand_occurrences(recurring_transaction, window_start, window_end):
    """All of this recurring transaction's occurrence dates that fall
    within [window_start, window_end], respecting its end_date.
    """
    step = _STEP[recurring_transaction.frequency]
    end_date = recurring_transaction.end_date
    current = recurring_transaction.start_date

    if end_date and current > end_date:
        return []

    # Fast-forward past occurrences before the window without emitting
    # them - a forecast only ever looks forward from today.
    while current < window_start:
        current = step(current)
        if end_date and current > end_date:
            return []

    occurrences = []
    while current <= window_end:
        if end_date and current > end_date:
            break
        occurrences.append(
            {
                "date": current,
                "amount_cents": recurring_transaction.amount_cents,
                "payee": recurring_transaction.payee,
                "recurring_transaction_id": recurring_transaction.id,
            }
        )
        current = step(current)
    return occurrences


def _loan_occurrences(loan, starting_balance, today, window_end):
    """A loan with a schedule follows it instead of recurring transactions:
    on each installment date after today, the balance becomes minus that
    installment's balance after. See the forecasting spec's "A loan is
    projected along its schedule"."""
    occurrences = []
    balance = starting_balance
    for installment in schedule(loan):
        if installment.date <= today:
            continue
        if installment.date > window_end:
            break
        occurrences.append(
            {
                "date": installment.date,
                "amount_cents": -installment.balance_after_cents - balance,
                "payee": f"Installment {installment.number} of {loan.term_months}",
                "recurring_transaction_id": None,
            }
        )
        balance = -installment.balance_after_cents
    return occurrences


def generate_forecast(account, horizon_days, today):
    """Project account's balance forward from `today` out to
    `today + horizon_days`, applying every recurring transaction's
    in-window occurrences on top of the account's current balance - a
    pure projection with nothing materialized or cached.
    """
    window_end = today + timedelta(days=horizon_days)
    starting_balance = account.current_balance_cents

    loan = getattr(account, "loan", None)
    if loan is not None:
        occurrences = _loan_occurrences(loan, starting_balance, today, window_end)
    else:
        occurrences = []
        for recurring in account.recurring_transactions.all():
            occurrences.extend(expand_occurrences(recurring, today, window_end))
        occurrences.sort(key=lambda o: o["date"])

    amount_by_date = {}
    for occurrence in occurrences:
        amount_by_date[occurrence["date"]] = (
            amount_by_date.get(occurrence["date"], 0) + occurrence["amount_cents"]
        )

    running = starting_balance
    points = []
    for offset in range(horizon_days + 1):
        day = today + timedelta(days=offset)
        running += amount_by_date.get(day, 0)
        points.append({"date": day.isoformat(), "balance_cents": running})

    return {
        "start_date": today.isoformat(),
        "horizon_days": horizon_days,
        "starting_balance_cents": starting_balance,
        "points": points,
        "occurrences": [
            {
                "date": o["date"].isoformat(),
                "amount_cents": o["amount_cents"],
                "payee": o["payee"],
                "recurring_transaction_id": o["recurring_transaction_id"],
            }
            for o in occurrences
        ],
    }

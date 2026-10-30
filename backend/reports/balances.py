"""Past balances, worked out from the ledger: nothing is stored. A value
adjustment is an ordinary row, so summing rows up to a date gives that
date's value. Archived accounts count, so archiving one doesn't rewrite
history. See openspec/specs/balance-history."""

from datetime import timedelta

from django.db.models import Min, Sum

from accounts.models import TIER_ORDER, TYPE_TIERS, Account
from budgets.utils import month_range
from transactions.models import Transaction

EVERYDAY_DAYS = 90
PROJECTION_DAYS = 30


def _openings():
    """Each tier's starting balances, which have no date of their own."""
    openings = dict.fromkeys(TIER_ORDER, 0)
    rows = Account.objects.values("account_type").annotate(total=Sum("starting_balance_cents"))
    for row in rows:
        openings[TYPE_TIERS[row["account_type"]]] += row["total"]
    return openings


def _changes(end):
    """[(date, tier, change)] up to and including `end`, oldest first. Split
    transactions count once, at their own amount."""
    rows = (
        Transaction.objects.ledger_rows()
        .filter(date__lte=end)
        .values("date", "account__account_type")
        .annotate(total=Sum("amount_cents"))
        .order_by("date")
    )
    return [(row["date"], TYPE_TIERS[row["account__account_type"]], row["total"]) for row in rows]


def history_tier():
    """The tier the everyday series covers: the only one in use, or
    Everyday. Matches the overview's Balance tile."""
    tiers = {a.tier for a in Account.objects.filter(archived=False)}
    return tiers.pop() if len(tiers) == 1 else "everyday"


def daily_balances(tier, end):
    """The tier's end-of-day balance for the EVERYDAY_DAYS ending at `end`,
    not going back before the tier's first row."""
    start = end - timedelta(days=EVERYDAY_DAYS - 1)
    balance = _openings()[tier]
    by_day = {}
    for day, row_tier, change in _changes(end):
        if row_tier == tier:
            by_day[day] = by_day.get(day, 0) + change

    points = []
    if not by_day:
        return points
    first = min(by_day)
    balance += sum(change for day, change in by_day.items() if day < start)
    day = max(start, first)
    while day <= end:
        balance += by_day.get(day, 0)
        points.append({"date": day, "balance_cents": balance})
        day += timedelta(days=1)
    return points


def tier_balance(tier, end):
    """One tier's balance at the end of `end`."""
    return _openings()[tier] + sum(change for _, row_tier, change in _changes(end) if row_tier == tier)


def month_end_balances(today):
    """Every account's balance per tier at each month's end, from the
    month of the first row to the current month, which reports today."""
    changes = _changes(today)
    if not changes:
        return []
    balances = _openings()
    months = []
    month = changes[0][0].replace(day=1)
    index = 0
    while month <= today:
        next_month = month_range(month)
        while index < len(changes) and changes[index][0] < next_month:
            _, tier, change = changes[index]
            balances[tier] += change
            index += 1
        months.append(
            {
                "month": month.strftime("%Y-%m"),
                "total_cents": sum(balances.values()),
                "tiers": [{"tier": t, "balance_cents": balances[t]} for t in TIER_ORDER if balances[t]],
            }
        )
        month = next_month
    return months


def net_worth_at(end):
    return sum(_openings().values()) + sum(change for _, _, change in _changes(end))


def net_worth_change(month, today):
    """Net worth at the end of `month` (or today) minus at the previous
    month's end, or None without an earlier month end."""
    first = Transaction.objects.ledger_rows().aggregate(first=Min("date"))["first"]
    previous_end = month - timedelta(days=1)
    if first is None or first > previous_end:
        return None
    end = min(month_range(month) - timedelta(days=1), today)
    return net_worth_at(end) - net_worth_at(previous_end)

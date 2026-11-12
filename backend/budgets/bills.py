"""Bills budgets: which payment pays each bill, and each bill's state - see
openspec/specs/bill-budgets.

Nothing is stored: matches are worked out from the month's outflows every
time, so edits, imports and deletes never leave a stale match. The rules are
plain functions of dates and cents, testable without the database; bill_rows
is the database layer.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta

from transactions.models import Transaction

from .utils import month_range

# A payment this many days either side of a bill's day can pay it.
MATCH_DAYS = 4
# An unpaid bill this many days or fewer before its day is due soon.
DUE_SOON_DAYS = 3
# Days after its day before an unpaid bill is missed - the same as loans.
GRACE_DAYS = 5


@dataclass(frozen=True)
class Outflow:
    id: int
    date: date
    cents: int  # positive: the amount that left


def due_date(month, day):
    """The bill's date in `month`: its day, or the month's last day when the
    month is shorter."""
    last = calendar.monthrange(month.year, month.month)[1]
    return month.replace(day=min(day, last))


def amount_window(amount_cents):
    """How far a payment may be from a bill's amount and still pay it: the
    larger of 30% and 5.00."""
    return max(amount_cents * 30 // 100, 500)


def paid_tolerance(amount_cents):
    """How much more than its amount a bill may be paid by and still count as
    paid rather than paid over: the larger of 5% and 1.00."""
    return max(amount_cents * 5 // 100, 100)


def match(bills, outflows, month):
    """{bill.id: Outflow} for the bills of one category in `month`. Bills go
    in order of their day; each takes the unused outflow within MATCH_DAYS of
    its date and inside its amount window that is closest in amount, then in
    date. Each outflow pays at most one bill."""
    used = set()
    matches = {}
    for bill in sorted(bills, key=lambda b: (b.day, b.id)):
        due = due_date(month, bill.day)
        window = amount_window(bill.amount_cents)
        candidates = [
            o
            for o in outflows
            if o.id not in used
            and o.date.year == month.year
            and o.date.month == month.month
            and abs((o.date - due).days) <= MATCH_DAYS
            and abs(o.cents - bill.amount_cents) <= window
        ]
        if not candidates:
            continue
        best = min(candidates, key=lambda o: (abs(o.cents - bill.amount_cents), abs((o.date - due).days), o.id))
        used.add(best.id)
        matches[bill.id] = best
    return matches


def bill_state(amount_cents, due, payment, ref_day, month_over, future):
    """One of paid_over, paid, upcoming, due_soon, not_seen or missed, as of
    `ref_day`. A future month's bills are upcoming; once a month has ended,
    an unpaid bill is missed."""
    if payment is not None:
        return "paid_over" if payment.cents > amount_cents + paid_tolerance(amount_cents) else "paid"
    if future:
        return "upcoming"
    if month_over:
        return "missed"
    if ref_day <= due:
        return "due_soon" if (due - ref_day).days <= DUE_SOON_DAYS else "upcoming"
    return "not_seen" if (ref_day - due).days <= GRACE_DAYS else "missed"


def month_outflows(category_ids_by_bills_category, month):
    """{bills category id: [Outflow]} for `month`: every outflow in the
    category or the subcategories it covers, at its finest grain (split
    parts, not the split itself), without value adjustments."""
    owners = {}
    for owner, ids in category_ids_by_bills_category.items():
        for category_id in ids:
            owners.setdefault(category_id, []).append(owner)
    rows = (
        Transaction.objects.counted_rows()
        .excluding_adjustments()
        .filter(category_id__in=owners, amount_cents__lt=0, date__gte=month, date__lt=month_range(month))
        .values_list("id", "date", "amount_cents", "category_id")
    )
    result = {owner: [] for owner in category_ids_by_bills_category}
    for tx_id, tx_date, cents, category_id in rows:
        for owner in owners[category_id]:
            result[owner].append(Outflow(tx_id, tx_date, -cents))
    return result


def bill_rows(categories, children, month, today):
    """{category id: figures} for the Bills categories in `categories` in
    `month`, as of today for the current month and the month's last day
    for a past one. `children` maps a parent id to its subcategories, whose
    outflows a parent's bills match too. A category without bills that
    count in the month is left out: it has no budget."""
    this_month = today.replace(day=1)
    future = month > this_month
    month_over = month < this_month
    ref_day = today if month == this_month else month_range(month) - timedelta(days=1)

    bills_by_category = {}
    for category in categories:
        bills = [b for b in category.bills.all() if b.from_month <= month]
        if bills:
            bills_by_category[category.id] = bills
    outflows = month_outflows(
        {cid: [cid, *(sub.id for sub in children.get(cid, []))] for cid in bills_by_category},
        month,
    )

    result = {}
    for category_id, bills in bills_by_category.items():
        matches = match(bills, outflows[category_id], month)
        lines = []
        for bill in sorted(bills, key=lambda b: (b.day, b.id)):
            due = due_date(month, bill.day)
            payment = matches.get(bill.id)
            state = bill_state(bill.amount_cents, due, payment, ref_day, month_over, future)
            lines.append(
                {
                    "id": bill.id,
                    "name": bill.name,
                    "day": bill.day,
                    "due_date": due,
                    "amount_cents": bill.amount_cents,
                    "state": state,
                    "paid_on": payment.date if payment else None,
                    "paid_cents": payment.cents if payment else None,
                    "over_cents": payment.cents - bill.amount_cents if state == "paid_over" else None,
                }
            )
        result[category_id] = {
            "budget_cents": sum(b.amount_cents for b in bills),
            "bills": lines,
            "paid_count": sum(1 for line in lines if line["paid_on"] is not None),
            "due_to_date_cents": sum(line["amount_cents"] for line in lines if line["due_date"] <= ref_day),
            "unpaid_cents": sum(line["amount_cents"] for line in lines if line["paid_on"] is None),
        }
    return result

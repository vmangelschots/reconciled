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
    larger of 15% and 2.00. Close enough that a matched amount can be
    offered as the bill's new price - see openspec/specs/bill-budgets."""
    return max(amount_cents * 15 // 100, 200)


def paid_tolerance(amount_cents):
    """How much more than its amount a bill may be paid by and still count as
    paid rather than paid over: the larger of 5% and 1.00."""
    return max(amount_cents * 5 // 100, 100)


def match(bills, outflows, month):
    """{bill.id: Outflow} for the bills of one category in `month`: every
    bill and outflow of the month within the amount window are paired at
    once, the pair closest in amount first, then the one closest to the
    bill's day. Each bill takes at most one outflow and each outflow pays at
    most one bill. The payee doesn't matter: with PayPal it says nothing."""
    pairs = []
    for bill in bills:
        due = due_date(month, bill.day)
        window = amount_window(bill.amount_cents)
        for o in outflows:
            diff = abs(o.cents - bill.amount_cents)
            if o.date.year == month.year and o.date.month == month.month and diff <= window:
                pairs.append((diff, abs((o.date - due).days), bill.day, bill.id, o.id, bill, o))
    pairs.sort(key=lambda p: p[:5])
    matches, used = {}, set()
    for *_, bill, outflow in pairs:
        if bill.id in matches or outflow.id in used:
            continue
        matches[bill.id] = outflow
        used.add(outflow.id)
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


def as_of(month, today):
    """(reference day, month over, future) for figures of `month`: today
    for the current month, the month's last day for a past one."""
    this_month = today.replace(day=1)
    ref_day = today if month == this_month else month_range(month) - timedelta(days=1)
    return ref_day, month < this_month, month > this_month


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


def bill_rows(categories, children, month, today, loan_lines=None):
    """{category id: figures} for the Bills categories in `categories` in
    `month`, as of today for the current month and the month's last day
    for a past one. `children` maps a parent id to its subcategories, whose
    outflows a parent's bills match too. A category without bills that
    count in the month is left out: it has no budget. `loan_lines` are a
    loan category's bills, their states already set by the loan (see
    budgets/loan_bills.py); they never take part in matching."""
    ref_day, month_over, future = as_of(month, today)
    loan_lines = loan_lines or {}

    bills_by_category = {}
    for category in categories:
        bills = [b for b in category.bills.all() if b.counts_in(month)]
        if bills:
            bills_by_category[category.id] = bills
    outflows = month_outflows(
        {cid: [cid, *(sub.id for sub in children.get(cid, []))] for cid in bills_by_category},
        month,
    )

    result = {}
    for category_id in {*bills_by_category, *(c.id for c in categories if loan_lines.get(c.id))}:
        bills = bills_by_category.get(category_id, [])
        matches = match(bills, outflows.get(category_id, []), month)
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
                    "source": "manual",
                    "loan_account_id": None,
                }
            )
        lines = sorted([*lines, *loan_lines.get(category_id, [])], key=lambda line: (line["day"], line["source"] == "loan", line["id"]))
        result[category_id] = {
            "budget_cents": sum(line["amount_cents"] for line in lines),
            "bills": lines,
            "paid_count": sum(1 for line in lines if line["paid_on"] is not None),
            "due_to_date_cents": sum(line["amount_cents"] for line in lines if line["due_date"] <= ref_day),
            "unpaid_cents": sum(line["amount_cents"] for line in lines if line["paid_on"] is None),
        }
    return result

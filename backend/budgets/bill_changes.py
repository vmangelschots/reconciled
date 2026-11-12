"""Changing a Bills category's bills from a month on - see
openspec/specs/bill-budgets, "Bill changes apply from the viewed month on".

Earlier months keep what they had: a bill that started before the month is
ended the month before, and a changed bill continues as a new one.
"""

from datetime import timedelta

from .models import Bill


def month_before(month):
    return (month - timedelta(days=1)).replace(day=1)


def apply_bills(category, month, lines):
    """Make `lines` ([{id or None, name, day, amount_cents}]) the bills of
    `category` from `month` on. Bills that don't count in `month` are left
    alone."""
    current = {b.id: b for b in category.bills.all() if b.counts_in(month)}
    previous = month_before(month)
    kept = set()
    for line in lines:
        values = {"name": line["name"], "day": line["day"], "amount_cents": line["amount_cents"]}
        bill = current.get(line["id"]) if line["id"] is not None else None
        if bill is None:
            Bill.objects.create(category=category, from_month=month, **values)
            continue
        kept.add(bill.id)
        if all(getattr(bill, field) == value for field, value in values.items()):
            continue
        if bill.from_month == month:
            for field, value in values.items():
                setattr(bill, field, value)
            bill.save()
        else:
            Bill.objects.create(category=category, from_month=month, until_month=bill.until_month, **values)
            bill.until_month = previous
            bill.save(update_fields=["until_month", "updated_at"])
    for bill in current.values():
        if bill.id in kept:
            continue
        if bill.from_month == month:
            bill.delete()
        else:
            bill.until_month = previous
            bill.save(update_fields=["until_month", "updated_at"])

"""Guessing a transaction's category from the user's own history.

A guess comes from the user's confirmed, non-transfer transactions with the
same normalized payee and the same direction (inflow or outflow): the
category used most often, the most recent one on a tie. Guesses are stored
as unconfirmed with source "history", and only ever fill an empty category.
Every rule lives here so import commit, the Review page and its backfill
all behave the same - see openspec/specs/auto-categorization.
"""

import re

from django.utils import timezone

from .models import Transaction

# Runs of letters (any script, so "é" counts) - digits, punctuation and
# underscores separate them. Bank payees carry terminal numbers, card
# fragments and dates that would otherwise make every line unique.
_LETTERS = re.compile(r"[^\W\d_]+")


def normalize_payee(payee):
    """'CARREFOUR MARKET 1234 BXL 23/10' -> 'carrefour market bxl'."""
    return " ".join(_LETTERS.findall((payee or "").lower()))


def payee_key(payee, amount_cents):
    """What history is matched on: the normalized payee plus the direction,
    so a refund never inherits a purchase's category."""
    return (normalize_payee(payee), amount_cents < 0)


def confirmed_history():
    """{key: {category_id: [count, last_seen]}} over every confirmed,
    categorized, non-transfer transaction. last_seen is the position in
    (date, id) order, so a higher value means more recent."""
    rows = (
        Transaction.objects.filter(
            category__isnull=False,
            category_confirmed=True,
            transfer_counterpart__isnull=True,
        )
        .order_by("date", "id")
        .values_list("payee", "amount_cents", "category_id")
    )
    history = {}
    for position, (payee, amount_cents, category_id) in enumerate(rows):
        key = payee_key(payee, amount_cents)
        if not key[0]:
            continue
        stats = history.setdefault(key, {}).setdefault(category_id, [0, 0])
        stats[0] += 1
        stats[1] = position
    return history


def best_category(category_stats):
    """The most frequent category, the most recently used one on a tie."""
    return max(category_stats, key=lambda category_id: tuple(category_stats[category_id]))


def categorize(transactions):
    """Guess a category for each uncategorized, non-transfer transaction
    among `transactions` (saved Transaction instances) and save the guesses.
    Returns how many got a category."""
    candidates = [
        t for t in transactions if t.category_id is None and t.transfer_counterpart_id is None
    ]
    if not candidates:
        return 0

    history = confirmed_history()
    now = timezone.now()
    changed = []
    for txn in candidates:
        category_stats = history.get(payee_key(txn.payee, txn.amount_cents))
        if not category_stats:
            continue
        txn.category_id = best_category(category_stats)
        txn.category_confirmed = False
        txn.category_source = Transaction.CategorySource.HISTORY
        # bulk_update skips auto_now, so set it by hand.
        txn.updated_at = now
        changed.append(txn)

    Transaction.objects.bulk_update(
        changed, ["category", "category_confirmed", "category_source", "updated_at"]
    )
    return len(changed)

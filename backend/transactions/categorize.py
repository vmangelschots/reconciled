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


def needs_review():
    """Transactions whose category is a guess nobody has confirmed yet."""
    return Transaction.objects.filter(category__isnull=False, category_confirmed=False)


def uncategorized():
    """What the backfill can try: no category and not a transfer."""
    return Transaction.objects.filter(category__isnull=True, transfer_counterpart__isnull=True)


def review_groups():
    """The Review page's groups: unconfirmed transactions that share a
    normalized payee, a direction, a guessed category and a source, largest
    group first (most recent first on a tie). Evidence is worked out from
    the current confirmed history, so nothing extra is stored."""
    rows = needs_review().select_related("account").order_by("date", "id")
    groups = {}
    for txn in rows:
        normalized, outflow = payee_key(txn.payee, txn.amount_cents)
        key = (normalized, outflow, txn.category_id, txn.category_source)
        group = groups.setdefault(
            key,
            {
                "key": "|".join([normalized, "out" if outflow else "in", str(txn.category_id), txn.category_source]),
                "direction": "out" if outflow else "in",
                "category": txn.category_id,
                "source": txn.category_source,
                "count": 0,
                "total_cents": 0,
                "accounts": [],
                "transactions": [],
            },
        )
        group["count"] += 1
        group["total_cents"] += txn.amount_cents
        if txn.account.name not in group["accounts"]:
            group["accounts"].append(txn.account.name)
        group["transactions"].append(
            {
                "id": txn.id,
                "date": txn.date.isoformat(),
                "account": txn.account.name,
                "payee": txn.payee,
                "amount_cents": txn.amount_cents,
                "notes": txn.notes,
            }
        )

    history = confirmed_history() if groups else {}
    result = []
    for (normalized, outflow, category_id, source), group in groups.items():
        txns = group["transactions"]
        # Rows are in date order, so the last one is the most recent.
        group["payee"] = txns[-1]["payee"]
        group["date_from"] = txns[0]["date"]
        group["date_to"] = txns[-1]["date"]
        group["evidence"] = None
        if source == Transaction.CategorySource.HISTORY:
            stats = history.get((normalized, outflow), {})
            group["evidence"] = {
                "matching": stats.get(category_id, [0, 0])[0],
                "total": sum(count for count, _ in stats.values()),
            }
        result.append(group)
    # Stable sorts: most recent first, then largest first on top of that.
    result.sort(key=lambda g: g["date_to"], reverse=True)
    result.sort(key=lambda g: g["count"], reverse=True)
    return result

"""Guessing a transaction's category from the user's own history, then
from an AI model for the payees history doesn't know.

A history guess comes from the user's confirmed, non-transfer transactions
with the same normalized payee and the same direction (inflow or outflow):
the category used most often, the most recent one on a tie. What history
leaves over goes to the AI guesser (transactions/ai.py), one question per
payee and direction, when one is configured. Guesses are stored as
unconfirmed with source "history" or "ai", and only ever fill an empty
category. Every rule lives here so import commit, the Review page and its
backfill all behave the same - see openspec/specs/auto-categorization.
"""

import logging
import re
import time
from dataclasses import dataclass

from django.conf import settings
from django.utils import timezone

from budgets.models import Category

from .ai import NOTES_MAX, PayeeQuestion, get_guesser
from .models import Transaction

logger = logging.getLogger(__name__)

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
        # A part of a split says little about the payee's usual category.
        Transaction.objects.filter(
            category__isnull=False,
            category_confirmed=True,
            transfer_counterpart__isnull=True,
            split_parent__isnull=True,
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


@dataclass
class CategorizeResult:
    history: int = 0  # rows guessed from history
    ai: int = 0  # rows guessed by AI
    # "off" (no guesser), "skipped" (nothing left to ask), or the guesser's
    # own "ok" / "failed" / "key_rejected".
    ai_status: str = "off"
    ai_declined: int = 0  # payees the model answered with no guess

    @property
    def categorized(self):
        return self.history + self.ai

    def summary(self):
        """The fields import commit and the backfill report."""
        return {
            "categorized_count": self.categorized,
            "categorized_by_source": {"history": self.history, "ai": self.ai},
            "ai": {"status": self.ai_status, "declined_count": self.ai_declined},
        }


def category_labels():
    """[(id, label)] for every category the AI may guess, "Parent / Child"
    for a subcategory. Tab groups and tabs are left out: whether someone
    owes money back isn't something a payee name can tell."""
    return [
        (c.id, f"{c.parent.name} / {c.name}" if c.parent_id else c.name)
        for c in Category.objects.select_related("parent")
        .filter(is_tab_group=False)
        .exclude(parent__is_tab_group=True)
        .order_by("id")
    ]


def payee_questions(transactions):
    """One PayeeQuestion per payee key among `transactions`, and the
    transactions behind each question's key. Only the payee, notes, amount
    and direction go in - see "AI sees only what it needs"."""
    by_key = {}
    for txn in transactions:
        key = payee_key(txn.payee, txn.amount_cents)
        if key[0]:
            by_key.setdefault(key, []).append(txn)
    questions = []
    rows = {}
    for index, txns in enumerate(by_key.values()):
        latest = max(txns, key=lambda t: (t.date, t.id))
        notes = next((t.notes for t in txns if t.notes), "")
        question = PayeeQuestion(
            key=f"p{index}",
            payee=latest.payee,
            notes=notes[:NOTES_MAX],
            amount_cents=max((t.amount_cents for t in txns), key=abs),
            direction="out" if latest.amount_cents < 0 else "in",
        )
        questions.append(question)
        rows[question.key] = txns
    return questions, rows


def categorize(transactions):
    """Guess a category for each uncategorized, non-transfer transaction
    among `transactions` (saved Transaction instances) and save the guesses
    in one update. History goes first; the AI guesser gets what's left and
    has AI_CATEGORIZATION_DEADLINE seconds for it. Never raises because of
    the AI step: a failure only leaves its rows uncategorized."""
    guesser = get_guesser()
    result = CategorizeResult(ai_status="off" if guesser is None else "skipped")
    # A split transaction and its parts are never guessed.
    candidates = [
        t
        for t in transactions
        if t.category_id is None and t.transfer_counterpart_id is None and t.split_parent_id is None
    ]
    split = set(
        Transaction.objects.filter(split_parent__in=[t.pk for t in candidates]).values_list(
            "split_parent_id", flat=True
        )
    )
    candidates = [t for t in candidates if t.pk not in split]
    if not candidates:
        return result

    history = confirmed_history()
    now = timezone.now()
    changed = []
    leftovers = []
    for txn in candidates:
        category_stats = history.get(payee_key(txn.payee, txn.amount_cents))
        if not category_stats:
            leftovers.append(txn)
            continue
        txn.category_id = best_category(category_stats)
        txn.category_confirmed = False
        txn.category_source = Transaction.CategorySource.HISTORY
        txn.category_reason = ""
        # bulk_update skips auto_now, so set it by hand.
        txn.updated_at = now
        changed.append(txn)
    result.history = len(changed)

    questions, rows = payee_questions(leftovers) if guesser else ([], {})
    categories = category_labels() if questions else []
    if questions and categories:
        deadline = time.monotonic() + settings.AI_CATEGORIZATION_DEADLINE
        try:
            guesses, result.ai_status = guesser.guess(questions, categories, deadline)
        except Exception:
            # The guesser shouldn't raise, but the history guesses must be
            # saved even if it does.
            logger.exception("AI guesser raised")
            guesses, result.ai_status = {}, "failed"
        valid_ids = {category_id for category_id, _ in categories}
        for key, guess in guesses.items():
            if key not in rows:
                continue
            if guess.category_id is None:
                result.ai_declined += 1
                continue
            if guess.category_id not in valid_ids:
                continue
            for txn in rows[key]:
                txn.category_id = guess.category_id
                txn.category_confirmed = False
                txn.category_source = Transaction.CategorySource.AI
                txn.category_reason = guess.reason[:200]
                txn.updated_at = now
                changed.append(txn)
                result.ai += 1

    Transaction.objects.bulk_update(
        changed,
        ["category", "category_confirmed", "category_source", "category_reason", "updated_at"],
    )
    return result


def needs_review():
    """Transactions whose category is a guess nobody has confirmed yet."""
    return Transaction.objects.filter(category__isnull=False, category_confirmed=False)


def uncategorized():
    """What the backfill can try: no category, not a transfer, and not a
    split transaction or one of its parts."""
    return (
        Transaction.objects.ledger_rows()
        .counted_rows()
        .filter(category__isnull=True, transfer_counterpart__isnull=True)
    )


def review_groups():
    """The Review page's groups: unconfirmed transactions that share a
    normalized payee, a direction, a guessed category and a source. History
    groups come before AI groups, each largest first (most recent first on a
    tie). History evidence is worked out from the current confirmed history;
    an AI group carries the model's reason instead."""
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
        group["latest_reason"] = txn.category_reason
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
        latest_reason = group.pop("latest_reason")
        group["reason"] = latest_reason if source == Transaction.CategorySource.AI else None
        if source == Transaction.CategorySource.HISTORY:
            stats = history.get((normalized, outflow), {})
            group["evidence"] = {
                "matching": stats.get(category_id, [0, 0])[0],
                "total": sum(count for count, _ in stats.values()),
            }
        result.append(group)
    # Stable sorts: most recent first, then largest first on top of that,
    # then history guesses before AI ones.
    result.sort(key=lambda g: g["date_to"], reverse=True)
    result.sort(key=lambda g: g["count"], reverse=True)
    result.sort(key=lambda g: g["source"] == Transaction.CategorySource.AI)
    return result

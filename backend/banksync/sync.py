"""Fetching linked accounts into the ledger. See openspec/specs/bank-sync."""

import logging
from contextlib import contextmanager
from datetime import date, timedelta

from django.db import connection, transaction as db_transaction
from django.utils import timezone

from imports.ledger import (
    confirm_transfer_counterpart,
    new_transaction,
    settle_accounts,
    settle_new_transactions,
)
from imports.utils import flag_transfer_matches, match_existing
from transactions.models import Transaction
from transactions.transfers import auto_link_transfers

from . import client
from .lines import BOOKED, to_candidate, with_references
from .models import BankAccountLink, SeenBankLine

logger = logging.getLogger(__name__)

# Lines a bank books late still arrive, and a failed period is retried.
OVERLAP_DAYS = 10
# Any fixed number: only sync takes this PostgreSQL advisory lock.
SYNC_LOCK = 8275001


@contextmanager
def _single_run():
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(%s)", [SYNC_LOCK])
        acquired = cursor.fetchone()[0]
    try:
        yield acquired
    finally:
        if acquired:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", [SYNC_LOCK])


def _syncable_links():
    return [
        link
        for link in BankAccountLink.objects.select_related("connection", "account").filter(
            account__archived=False, connection__isnull=False
        )
        if not link.connection.ended
    ]


def _fetch_from(link):
    if link.last_synced_at is None:
        return link.start_date
    return max(link.start_date, timezone.localdate(link.last_synced_at) - timedelta(days=OVERLAP_DAYS))


def _new_lines(link, lines):
    pairs = [
        (line, to_candidate(line, link.bank_name))
        for line in lines
        if line.get("status") == BOOKED
    ]
    candidates = with_references(pairs)
    seen = set(
        SeenBankLine.objects.filter(
            account_hash=link.account_hash, reference__in=[c["reference"] for c in candidates]
        ).values_list("reference", flat=True)
    )
    new = [
        c
        for c in candidates
        if c["reference"] not in seen
        and c["amount_cents"] != 0
        and date.fromisoformat(c["date"]) >= link.start_date
    ]
    return sorted(new, key=lambda c: c["date"])


@db_transaction.atomic
def _post_lines(link, lines):
    """Into the ledger, with the link's state, all or nothing. Returns the
    transactions created."""
    account = link.account
    new = flag_transfer_matches(account, _new_lines(link, lines))
    # Rows a bank line already belongs to can't be adopted, so two synced
    # payments with different references never hide each other.
    adoptable = (
        Transaction.objects.ledger_rows()
        .excluding_adjustments()
        .filter(account=account)
        .exclude(pk__in=SeenBankLine.objects.exclude(transaction=None).values("transaction"))
    )
    plain = [c for c in new if not c["transfer_match"]]
    adopted = match_existing(adoptable, plain)

    created = []
    seen = []
    for candidate in new:
        reference = candidate["reference"]
        notes = candidate["description"] if candidate["description"] != candidate["payee"] else ""
        counterpart = candidate["transfer_match"]
        if counterpart and confirm_transfer_counterpart(account, candidate, notes):
            seen.append(SeenBankLine(transaction_id=counterpart["transaction_id"], reference=reference))
            continue
        match = adopted.get(reference)
        if match is not None:
            seen.append(SeenBankLine(transaction=match, reference=reference))
            continue
        row = new_transaction(account, candidate)
        row.save()
        created.append(row)
        seen.append(SeenBankLine(transaction=row, reference=reference))

    for row in seen:
        row.account_hash = link.account_hash
    SeenBankLine.objects.bulk_create(seen)
    settle_accounts([account.pk])

    link.last_synced_at = timezone.now()
    link.last_added_count = len(created)
    link.last_error = ""
    link.save(update_fields=["last_synced_at", "last_added_count", "last_error"])
    return created


def _sync_link(link, psu_headers):
    """What the link added, or nothing: a failure stays with its link."""
    try:
        lines = client.fetch_transactions(link.account_uid, _fetch_from(link), psu_headers)
        return _post_lines(link, lines)
    except client.SessionEnded as e:
        link.connection.ended_early = True
        link.connection.save(update_fields=["ended_early"])
        error = str(e)
    except client.BankError as e:
        error = str(e)
    except Exception:
        logger.exception("Bank sync failed for link %s", link.pk)
        error = "This account couldn't be synced."
    link.last_error = error
    link.save(update_fields=["last_error"])
    return []


def sync_all(psu_headers=None):
    """Sync every linked account. Returns the lines added, or None when
    another sync is running."""
    with _single_run() as acquired:
        if not acquired:
            return None
        links = _syncable_links()
        created = []
        for link in links:
            # A session that ended on an earlier link of this run.
            link.connection.refresh_from_db(fields=["ended_early"])
            if not link.connection.ended:
                created += _sync_link(link, psu_headers)

        auto_link_transfers(created, BankAccountLink.objects.filter(account__archived=False).values("account"))
        settle_new_transactions(
            Transaction.objects.filter(pk__in=[t.pk for t in created], transfer_counterpart__isnull=True)
        )
        return len(created)

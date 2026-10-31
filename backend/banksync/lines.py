"""Turning a bank's line into the candidate shape imports use. See
openspec/specs/bank-sync and "Mapping keeps Crelan lines identical to its
CSV" in the enable-banking-sync design."""

import hashlib
from collections import Counter
from decimal import Decimal

BOOKED = "BOOK"
DEBIT = "DBIT"
NO_PAYEE = "Unknown"

DEFAULT_DATE_FIELDS = ("transaction_date", "booking_date")
# Where a bank differs from the default.
DATE_FIELDS = {}


def _party(line, side):
    return ((line.get(side) or {}).get("name") or "").strip()


def to_candidate(line, bank_name):
    debit = line.get("credit_debit_indicator") == DEBIT
    amount = abs(Decimal(line["transaction_amount"]["amount"]))
    cents = int((amount * 100).to_integral_value())
    remittance = [text.strip() for text in line.get("remittance_information") or [] if text and text.strip()]
    description = remittance[0] if remittance else ""
    fields = DATE_FIELDS.get(bank_name, DEFAULT_DATE_FIELDS)
    return {
        "date": next(line[f] for f in fields if line.get(f)),
        "amount_cents": -cents if debit else cents,
        # Both sides can be filled, one of them being the account's owner.
        "payee": (_party(line, "creditor" if debit else "debtor") or description or NO_PAYEE)[:255],
        "description": description,
    }


def with_references(pairs):
    """[(line, candidate)] with each candidate's reference attached. A bank
    reference that is empty or repeated within the fetch can't identify a
    line, so those get a hash of what they show, and their position among
    identical lines that day."""
    references = Counter(line.get("entry_reference") for line, _ in pairs)
    positions = Counter()
    result = []
    for line, candidate in pairs:
        reference = line.get("entry_reference")
        if not reference or references[reference] > 1:
            shown = (candidate["date"], candidate["amount_cents"], candidate["payee"])
            positions[shown] += 1
            text = "|".join(str(part) for part in (*shown, positions[shown]))
            reference = "hash:" + hashlib.sha256(text.encode()).hexdigest()[:40]
        result.append({**candidate, "reference": str(reference)[:200]})
    return result

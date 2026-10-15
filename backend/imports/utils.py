import csv
import io
from datetime import datetime
from difflib import SequenceMatcher

from ofxparse import OfxParser

DUPLICATE_SIMILARITY_THRESHOLD = 0.8


class ImportParseError(ValueError):
    """Raised for any user-facing import problem - unsupported file,
    malformed OFX, missing required CSV mapping, bad amount/date values.
    Views catch this and turn it into a 400 with .args[0] as the message.
    """


def detect_file_format(filename):
    lower = (filename or "").lower()
    if lower.endswith(".csv"):
        return "csv"
    if lower.endswith(".ofx"):
        return "ofx"
    raise ImportParseError(
        f"Unsupported file type for '{filename}'. Only .csv and .ofx files are supported."
    )


def decode_upload(file_obj):
    raw = file_obj.read()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1")


def csv_columns(raw_content):
    reader = csv.reader(io.StringIO(raw_content))
    try:
        return next(reader)
    except StopIteration:
        raise ImportParseError("CSV file is empty.")


def _parse_amount_cents(raw):
    cleaned = raw.replace("$", "").replace(",", "").strip()
    if not cleaned:
        return None
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    try:
        return round(float(cleaned) * 100)
    except ValueError:
        return None


def _parse_date(raw):
    raw = raw.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    raise ImportParseError(f"Could not parse date '{raw}'.")


def validate_csv_mapping(mapping):
    """mapping: {"date": col, "description": col, "amount": col | None,
    "debit": col | None, "credit": col | None, "payee": col | None}

    Raises ImportParseError listing missing fields if invalid.
    """
    missing = []
    if not mapping.get("date"):
        missing.append("date")
    if not mapping.get("description"):
        missing.append("description")
    has_amount = bool(mapping.get("amount"))
    has_debit_credit = bool(mapping.get("debit")) and bool(mapping.get("credit"))
    if not has_amount and not has_debit_credit:
        missing.append("amount (or both debit and credit)")
    if missing:
        raise ImportParseError(
            "Missing required mapping for: " + ", ".join(missing)
        )


def parse_csv_candidates(raw_content, mapping):
    validate_csv_mapping(mapping)
    reader = csv.DictReader(io.StringIO(raw_content))
    candidates = []
    for row in reader:
        date = _parse_date(row[mapping["date"]])
        description = row.get(mapping["description"], "").strip()
        payee = row.get(mapping.get("payee"), "").strip() if mapping.get("payee") else description

        if mapping.get("amount"):
            amount_cents = _parse_amount_cents(row[mapping["amount"]])
        else:
            debit = _parse_amount_cents(row.get(mapping["debit"], "") or "")
            credit = _parse_amount_cents(row.get(mapping["credit"], "") or "")
            if debit:
                amount_cents = -abs(debit)
            elif credit:
                amount_cents = abs(credit)
            else:
                amount_cents = 0

        if amount_cents is None:
            continue

        candidates.append(
            {
                "date": date,
                "amount_cents": amount_cents,
                "description": description,
                "payee": payee or description,
            }
        )
    return candidates


def parse_ofx_candidates(raw_content):
    try:
        ofx = OfxParser.parse(io.StringIO(raw_content))
    except Exception as exc:  # ofxparse raises a variety of error types
        raise ImportParseError(f"Could not parse OFX file: {exc}") from exc

    candidates = []
    for account in ofx.accounts:
        for txn in account.statement.transactions:
            payee = (txn.payee or "").strip()
            description = (txn.memo or payee).strip()
            candidates.append(
                {
                    "date": txn.date.date().isoformat(),
                    "amount_cents": round(float(txn.amount) * 100),
                    "description": description,
                    "payee": payee or description,
                }
            )
    return candidates


def _is_similar(a, b, threshold=DUPLICATE_SIMILARITY_THRESHOLD):
    return SequenceMatcher(None, (a or "").lower(), (b or "").lower()).ratio() >= threshold


def flag_duplicates(account, candidates):
    """Attach is_duplicate + index to each candidate, comparing against
    existing transactions on the same account by exact date + exact
    amount + a fuzzy-matched description/payee.
    """
    from transactions.models import Transaction

    by_date_amount = {}
    for txn in Transaction.objects.filter(account=account):
        by_date_amount.setdefault((txn.date.isoformat(), txn.amount_cents), []).append(txn)

    flagged = []
    for index, candidate in enumerate(candidates):
        key = (candidate["date"], candidate["amount_cents"])
        is_duplicate = any(
            _is_similar(candidate["description"], existing.payee)
            for existing in by_date_amount.get(key, [])
        )
        flagged.append({**candidate, "index": index, "is_duplicate": is_duplicate})
    return flagged

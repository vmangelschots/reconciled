import csv
import io
from datetime import date, datetime
from difflib import SequenceMatcher

from ofxparse import OfxParser

DUPLICATE_SIMILARITY_THRESHOLD = 0.8

# A fixed, validated set - not arbitrary user-supplied strptime strings.
# No default is pre-selected anywhere; the user must choose one (design.md).
DATE_FORMATS = {
    "YYYY-MM-DD": "%Y-%m-%d",
    "DD/MM/YYYY": "%d/%m/%Y",
    "MM/DD/YYYY": "%m/%d/%Y",
    "DD-MM-YYYY": "%d-%m-%Y",
    "MM-DD-YYYY": "%m-%d-%Y",
    "DD.MM.YYYY": "%d.%m.%Y",
}

# Candidates real bank/spreadsheet CSV exports actually use. Restricting
# Sniffer to these (rather than letting it guess from any character)
# avoids false positives from a stray character in a free-text field.
_DELIMITER_CANDIDATES = ",;\t|"


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


def detect_delimiter(raw_content):
    """Detect the column delimiter from the file's own content, restricted
    to the candidates real exports actually use. Falls back to comma on
    an inconclusive sample (e.g. a single-column file), preserving
    today's exact behavior for files that already work.
    """
    try:
        return csv.Sniffer().sniff(raw_content[:4096], delimiters=_DELIMITER_CANDIDATES).delimiter
    except csv.Error:
        return ","


def csv_columns(raw_content, delimiter=","):
    reader = csv.reader(io.StringIO(raw_content), delimiter=delimiter)
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


def _parse_date(raw, date_format):
    # Only the date part counts: "2026-10-12 2:00:00" is 12 October. None
    # of the DATE_FORMATS contain a space, so this never cuts a date short.
    raw = raw.strip()
    raw = raw.split(None, 1)[0] if raw else raw
    pattern = DATE_FORMATS.get(date_format)
    if not pattern:
        raise ImportParseError(f"Unsupported date format '{date_format}'.")
    try:
        return datetime.strptime(raw, pattern).date().isoformat()
    except ValueError:
        raise ImportParseError(f"Could not parse date '{raw}' using format '{date_format}'.")


def validate_csv_mapping(mapping):
    """mapping: {"date": col, "date_format": key (see DATE_FORMATS),
    "description": col, "amount": col | None, "debit": col | None,
    "credit": col | None, "payee": col | None}

    Raises ImportParseError listing missing fields if invalid.
    """
    missing = []
    if not mapping.get("date"):
        missing.append("date")
    if not mapping.get("date_format"):
        missing.append("date_format")
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


def parse_csv_candidates(raw_content, mapping, delimiter=","):
    validate_csv_mapping(mapping)
    reader = csv.DictReader(io.StringIO(raw_content), delimiter=delimiter)
    candidates = []
    for row in reader:
        date = _parse_date(row[mapping["date"]], mapping["date_format"])
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


def match_existing(existing_rows, candidates):
    """Which existing transaction each candidate is already in the ledger
    as, by exact date + exact amount + a fuzzy-matched payee. Payee against
    payee: a line's description is often a bank's generic type
    ("Kaartbetaling"), which would match unrelated lines of the same amount.
    Each existing transaction is claimed by the first matching candidate in
    order, so two identical payments on one day aren't both hidden by a
    single earlier one. Returns {candidate key: transaction}, keyed by the
    candidate's reference or else its position.
    """
    by_date_amount = {}
    for txn in existing_rows:
        by_date_amount.setdefault((txn.date.isoformat(), txn.amount_cents), []).append(txn)

    claimed = set()
    matches = {}
    for index, candidate in enumerate(candidates):
        key = (candidate["date"], candidate["amount_cents"])
        match = next(
            (
                existing
                for existing in by_date_amount.get(key, [])
                if existing.pk not in claimed and _is_similar(candidate["payee"], existing.payee)
            ),
            None,
        )
        if match is not None:
            claimed.add(match.pk)
            matches[candidate.get("reference", index)] = match
    return matches


def flag_duplicates(account, candidates):
    """Attach is_duplicate + index to each candidate, comparing against
    existing transactions on the same account with match_existing."""
    from transactions.models import Transaction

    # The bank's lines only: a split transaction is compared, its parts
    # never are, and neither is a value adjustment.
    existing = Transaction.objects.ledger_rows().excluding_adjustments().filter(account=account)
    matches = match_existing(existing, candidates)
    # An index numbered across all of an import's accounts is kept.
    return [
        {"index": index, **candidate, "is_duplicate": index in matches}
        for index, candidate in enumerate(candidates)
    ]


def flag_transfer_matches(account, candidates):
    """Attach transfer_match to each candidate: the transfer counterpart the
    app created in this account (not yet confirmed by an import) that the
    bank line is the real version of - same amount, dated within the
    transfer window, closest date first, each counterpart claimed once.
    A matched line replaces that counterpart on commit, so it is never
    also a duplicate. See openspec/specs/transaction-import.
    """
    from transactions.models import Transaction
    from transactions.transfers import TRANSFER_MATCH_DAYS

    pending = list(
        Transaction.objects.filter(
            account=account, created_by_transfer=True, transfer_counterpart__isnull=False
        ).select_related("transfer_counterpart__account")
    )
    claimed = set()
    flagged = []
    for candidate in candidates:
        # A pocket move is matched to its other side in the same file.
        if candidate.get("pocket_pair"):
            flagged.append({**candidate, "transfer_match": None})
            continue
        on = date.fromisoformat(candidate["date"])
        options = [
            t
            for t in pending
            if t.pk not in claimed
            and t.amount_cents == candidate["amount_cents"]
            and abs((t.date - on).days) <= TRANSFER_MATCH_DAYS
        ]
        match = min(options, key=lambda t: (abs((t.date - on).days), t.pk), default=None)
        if match is None:
            flagged.append({**candidate, "transfer_match": None})
            continue
        claimed.add(match.pk)
        flagged.append(
            {
                **candidate,
                "is_duplicate": False,
                "transfer_match": {
                    "transaction_id": match.pk,
                    "counterpart_account_name": match.transfer_counterpart.account.name,
                },
            }
        )
    return flagged

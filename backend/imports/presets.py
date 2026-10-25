"""Bank exports recognized by their header row, so the user never maps
their columns. See openspec/specs/bank-export-formats.

A preset turns the file's rows (csv.DictReader dicts) into the same
candidate dicts parse_csv_candidates produces. Revolut candidates also
carry "product" (which account they go to) and "started_at" (the full
Started Date, which pairs the two sides of a pocket move).
"""

from .utils import _parse_amount_cents, _parse_date


def _first_filled(row, *columns):
    return next((row[c].strip() for c in columns if (row.get(c) or "").strip()), "")


class Preset:
    key = ""
    label = ""
    # Matching a subset, not the exact header, so an extra column added by
    # the bank later doesn't stop the file being recognized.
    required_columns = frozenset()

    def matches(self, columns):
        return self.required_columns <= set(columns)

    def parse(self, rows):
        raise NotImplementedError


class Crelan(Preset):
    key = "crelan"
    label = "Crelan"
    required_columns = frozenset({"Datum", "Bedrag", "Tegenpartij", "Type verrichting", "Mededeling"})

    def parse(self, rows):
        candidates = []
        for row in rows:
            amount_cents = _parse_amount_cents(row["Bedrag"] or "")
            if amount_cents is None:
                continue
            candidates.append(
                {
                    "date": _parse_date(row["Datum"], "DD/MM/YYYY"),
                    "amount_cents": amount_cents,
                    "description": _first_filled(row, "Mededeling", "Type verrichting"),
                    "payee": _first_filled(row, "Tegenpartij", "Mededeling", "Type verrichting"),
                }
            )
        return candidates


class Revolut(Preset):
    key = "revolut"
    label = "Revolut"
    required_columns = frozenset({"Product", "Started Date", "Description", "Amount", "Fee", "State"})

    def parse(self, rows):
        candidates = []
        for row in rows:
            # Pending, reverted and declined rows never moved money.
            if row["State"].strip() != "COMPLETED":
                continue
            amount_cents = _parse_amount_cents(row["Amount"] or "")
            if amount_cents is None:
                continue
            # The fee is charged on top of the amount; include it so the
            # balance matches Revolut's.
            amount_cents -= _parse_amount_cents(row["Fee"] or "") or 0
            description = row["Description"].strip()
            candidates.append(
                {
                    # The day the payment was made; card payments often
                    # complete a day later.
                    "date": _parse_date(row["Started Date"], "YYYY-MM-DD"),
                    "amount_cents": amount_cents,
                    "description": description,
                    "payee": description,
                    "product": row["Product"].strip(),
                    "started_at": row["Started Date"].strip(),
                }
            )
        return candidates


PRESETS = [Revolut(), Crelan()]
PRESETS_BY_KEY = {p.key: p for p in PRESETS}


def detect_preset(columns):
    return next((p for p in PRESETS if p.matches(columns)), None)


def products_in(candidates):
    """The Revolut Products in file order, each once."""
    return list(dict.fromkeys(c["product"] for c in candidates))


def pair_pocket_moves(candidates):
    """Attach pocket_pair to each candidate: the other side of a Revolut
    pocket move - a row on a different account started at the same moment
    with the opposite amount. Each row pairs at most once, in file order.
    Candidates must already carry index, account_id and account_name."""
    paired = {}
    for c in candidates:
        if c["index"] in paired or "started_at" not in c:
            continue
        other = next(
            (
                o
                for o in candidates
                if o["index"] not in paired
                and o["index"] != c["index"]
                and o.get("started_at") == c["started_at"]
                and o["account_id"] != c["account_id"]
                and o["amount_cents"] == -c["amount_cents"]
            ),
            None,
        )
        if other is not None:
            paired[c["index"]] = other
            paired[other["index"]] = c
    return [
        {
            **c,
            "pocket_pair": (
                {"index": paired[c["index"]]["index"], "account_name": paired[c["index"]]["account_name"]}
                if c["index"] in paired
                else None
            ),
        }
        for c in candidates
    ]

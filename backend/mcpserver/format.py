"""How tools present values to a model - see openspec/specs/mcp-server,
"Amounts, dates and months". Money is a decimal string with its currency,
because models misread cents."""

from datetime import date

CURRENCY = "EUR"


def money(cents):
    """-4250 -> "-42.50 EUR". None stays None (no limit, nothing due)."""
    if cents is None:
        return None
    sign = "-" if cents < 0 else ""
    whole, part = divmod(abs(int(cents)), 100)
    return f"{sign}{whole}.{part:02d} {CURRENCY}"


def day(value):
    return value.isoformat() if value is not None else None


def month(value):
    """date(2026, 11, 1) -> "2026-11"."""
    return value.strftime("%Y-%m") if value is not None else None


def parse_month(text):
    """"2026-11" -> date(2026, 11, 1), or ValueError."""
    try:
        year, number = text.split("-")
        if len(year) != 4 or len(number) != 2:
            raise ValueError
        return date(int(year), int(number), 1)
    except (ValueError, AttributeError):
        raise ValueError("must be a valid month written as YYYY-MM, for example 2026-11") from None


def parse_day(text):
    try:
        return date.fromisoformat(text)
    except (ValueError, TypeError):
        raise ValueError("must be a valid date written as YYYY-MM-DD, for example 2026-11-19") from None


def parse_amount(text):
    """"-42.50" or -42.5 -> -4250 cents, or ValueError."""
    from decimal import Decimal, InvalidOperation

    try:
        value = Decimal(str(text).replace(CURRENCY, "").strip())
    except InvalidOperation:
        raise ValueError("must be an amount in euro, for example -42.50") from None
    if not value.is_finite():
        raise ValueError("must be an amount in euro, for example -42.50")
    return int((value * 100).to_integral_value())


def present(value):
    """A service result as tools return it: every `x_cents` field becomes `x`
    as a money string, dates become ISO, recursively. So every tool shows
    money the same way without restating each service's fields."""
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            key = str(key)
            if key.endswith("_cents") and (item is None or isinstance(item, int)) and not isinstance(item, bool):
                out[key[: -len("_cents")]] = money(item)
            else:
                out[key] = present(item)
        return out
    if isinstance(value, (list, tuple)):
        return [present(item) for item in value]
    if isinstance(value, date):
        return value.isoformat()
    return value

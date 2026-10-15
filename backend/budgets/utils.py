from datetime import date


def parse_month(value):
    """Parse a 'YYYY-MM' string into a first-of-month date.

    Returns None for a falsy value (meaning "the default limit", not a
    specific month). Raises ValueError on anything else malformed.
    """
    if not value:
        return None
    try:
        year_str, month_str = str(value).split("-")
        return date(int(year_str), int(month_str), 1)
    except (ValueError, AttributeError) as exc:
        raise ValueError(f"Invalid month '{value}', expected YYYY-MM.") from exc


def month_range(period_start):
    """Return the exclusive end date of the month period_start falls in."""
    if period_start.month == 12:
        return date(period_start.year + 1, 1, 1)
    return date(period_start.year, period_start.month + 1, 1)

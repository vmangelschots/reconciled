from datetime import date

from django.utils import timezone


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


def today():
    """Today's local date; called through the module so tests can freeze
    it with patch("budgets.utils.today")."""
    return timezone.localdate()


def parse_due(value):
    """Parse an 'MM-DD' due date into (month, day). 29 February is
    rejected: a due date must exist every year."""
    try:
        month_str, day_str = str(value).split("-")
        month, day = int(month_str), int(day_str)
        date(2025, month, day)
    except (ValueError, AttributeError) as exc:
        raise ValueError(f"Invalid due date '{value}', expected MM-DD (29 February isn't allowed).") from exc
    return month, day

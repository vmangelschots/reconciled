"""Writing a monthly category's default limit, which applies from a month on -
see openspec/specs/budgets, "Editing the default edits the one in effect"."""

from .models import CategoryLimit
from .summary import default_in_effect


def defaults_of(category):
    return [limit for limit in category.limits.all() if limit.month is None]


def set_default(category, limit_cents, in_effect):
    """Set the default in effect in `in_effect` (a first-of-month date) to
    `limit_cents`, from the month it started in until the next change. A
    category without a default gets one from the start."""
    row = default_in_effect(defaults_of(category), in_effect)
    if row is None:
        return CategoryLimit.objects.create(category=category, month=None, from_month=None, limit_cents=limit_cents)
    row.limit_cents = limit_cents
    row.save(update_fields=["limit_cents", "updated_at"])
    return row

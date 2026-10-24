"""Rules about tab groups that other apps share. A tab group is a
top-level category whose subcategories are tabs; the group itself is
only a heading and never a transaction's category. Balances live in
transactions/tabs.py - see openspec/specs/repayment-tabs.
"""

from rest_framework import serializers

TAB_GROUP_ERROR = "A tab group can't be a transaction's category. Pick one of its tabs."


def check_assignable(category):
    """Raise a ValidationError when `category` can't be given to a
    transaction or a part; return it otherwise."""
    if category is not None and category.is_tab_group:
        raise serializers.ValidationError(TAB_GROUP_ERROR)
    return category

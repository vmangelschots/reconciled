"""Accounts, categories and transactions. See openspec/specs/mcp-server."""

import base64
import binascii
from datetime import date

from django.db.models import Prefetch, Q

from accounts.models import Account, tier_position
from budgets.models import Category
from transactions.models import Transaction

from .. import format as fmt
from ..registry import Arg, ToolError, tool

PAGE_SIZE = 50
MAX_PAGE_SIZE = 200

KIND_NAMES = {
    Category.BudgetKind.MONTHLY: "monthly",
    Category.BudgetKind.YEARLY: "yearly",
    Category.BudgetKind.TARGET: "yearly on a date",
    Category.BudgetKind.BILLS: "bills",
}


@tool(
    "list_accounts",
    "Accounts",
    """
    The household's accounts with their type and current balance, as the Accounts page shows them,
    listed by tier (everyday money first, then savings, investments, property and loans).
    Archived accounts are left out unless include_archived is true.
    """,
    [Arg("include_archived", "boolean", "Also return archived accounts. Defaults to false.")],
)
def list_accounts(include_archived=False):
    accounts = Account.objects.visible().order_by(tier_position(), "name", "id")
    if not include_archived:
        accounts = accounts.filter(archived=False)
    return {
        "accounts": [
            {
                "id": a.id,
                "name": a.name,
                "type": a.account_type,
                "balance": fmt.money(a.current_balance_cents),
                "archived": a.archived,
            }
            for a in accounts
        ]
    }


@tool(
    "list_categories",
    "Categories",
    """
    The household's categories as a tree: top-level categories with their subcategories. Each has a budget
    kind: monthly (a monthly limit), yearly (a yearly amount), yearly on a date (one amount due on a day each
    year) or bills (a list of fixed monthly bills). A budget on a parent covers everything under it. Tab groups
    hold tabs: money other people owe you or you owe them, which isn't budgeted.
    """,
)
def list_categories():
    categories = list(Category.objects.order_by("name", "id"))
    children = {}
    for c in categories:
        if c.parent_id is not None:
            children.setdefault(c.parent_id, []).append(c)

    def row(c, parent=None):
        is_tab = parent is not None and parent.is_tab_group
        return {
            "id": c.id,
            "name": c.name,
            "budget_kind": None if c.is_tab_group or is_tab else KIND_NAMES.get(c.budget_kind, c.budget_kind),
            "is_tab_group": c.is_tab_group,
            "is_tab": is_tab,
        }

    return {
        "categories": [
            {**row(c), "subcategories": [row(s, c) for s in children.get(c.id, [])]}
            for c in categories
            if c.parent_id is None
        ]
    }


def _category_label(category):
    if category is None:
        return None
    return f"{category.parent.name} / {category.name}" if category.parent_id else category.name


def _row(txn):
    parts = list(txn.parts.all())
    return {
        "id": txn.id,
        "date": fmt.day(txn.date),
        "amount": fmt.money(txn.amount_cents),
        "payee": txn.payee,
        "account": txn.account.name,
        "account_id": txn.account_id,
        "category": "Split" if parts else _category_label(txn.category),
        "category_id": None if parts else txn.category_id,
        "notes": txn.notes,
        "is_split": bool(parts),
        "is_transfer": txn.transfer_counterpart_id is not None,
        "is_value_adjustment": txn.is_adjustment,
    }


def _ledger():
    """What the Transactions page lists: the bank's lines, parts inside their
    split, without the off-bank rows of covered entries."""
    return (
        Transaction.objects.exclude(account__is_off_bank=True)
        .select_related("account", "category__parent", "transfer_counterpart__account")
        .prefetch_related(
            Prefetch("parts", queryset=Transaction.objects.select_related("category__parent", "transfer_counterpart__account"))
        )
    )


def _encode_cursor(txn):
    return base64.urlsafe_b64encode(f"{txn.date.isoformat()}|{txn.id}".encode()).decode()


def _decode_cursor(cursor):
    try:
        day, pk = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return date.fromisoformat(day), int(pk)
    except (ValueError, binascii.Error, UnicodeDecodeError):
        raise ToolError("cursor isn't one this search returned. Start again without a cursor.") from None


@tool(
    "search_transactions",
    "Search transactions",
    """
    Search the household's transactions, newest first. Every filter is optional and they combine.
    category_id includes the category's subcategories, and a split transaction matches through any of its parts.
    text matches the payee or notes, ignoring case. Amounts are negative for money going out, so
    max_amount "-100" finds payments of 100 euro or more. Returns at most `limit` transactions (50 by default,
    200 at most), the total number of matches, and a next_cursor to pass back for the next page.
    """,
    [
        Arg("date_from", "date", "First date to include, YYYY-MM-DD."),
        Arg("date_to", "date", "Last date to include, YYYY-MM-DD."),
        Arg("account_ids", "integer_list", "Only these accounts (ids from list_accounts)."),
        Arg("category_id", "integer", "Only this category and its subcategories (an id from list_categories)."),
        Arg("uncategorized", "boolean", "Only transactions without a category (not transfers, splits or value adjustments)."),
        Arg("text", "string", "Text the payee or notes contain."),
        Arg("min_amount", "amount", "Smallest amount, e.g. \"-250.00\"."),
        Arg("max_amount", "amount", "Largest amount, e.g. \"-10.00\"."),
        Arg("limit", "integer", "How many to return, 1 to 200. Defaults to 50.", minimum=1, maximum=MAX_PAGE_SIZE),
        Arg("cursor", "string", "next_cursor from the previous page."),
    ],
)
def search_transactions(
    date_from=None,
    date_to=None,
    account_ids=None,
    category_id=None,
    uncategorized=False,
    text=None,
    min_amount=None,
    max_amount=None,
    limit=PAGE_SIZE,
    cursor=None,
):
    after = _decode_cursor(cursor) if cursor else None
    rows = _ledger().ledger_rows()
    if date_from:
        rows = rows.filter(date__gte=date_from)
    if date_to:
        rows = rows.filter(date__lte=date_to)
    if account_ids:
        rows = rows.filter(account_id__in=account_ids)
    if category_id is not None:
        if not Category.objects.filter(pk=category_id).exists():
            raise ToolError(f"There is no category with id {category_id}. list_categories gives the ids.")
        under = Q(category_id=category_id) | Q(category__parent_id=category_id)
        part_under = Q(parts__category_id=category_id) | Q(parts__category__parent_id=category_id)
        rows = rows.filter(under | part_under)
    if uncategorized:
        rows = rows.counted_rows().excluding_adjustments().filter(category__isnull=True, transfer_counterpart__isnull=True)
    if text:
        rows = rows.filter(Q(payee__icontains=text) | Q(notes__icontains=text) | Q(parts__notes__icontains=text))
    if min_amount is not None:
        rows = rows.filter(amount_cents__gte=min_amount)
    if max_amount is not None:
        rows = rows.filter(amount_cents__lte=max_amount)
    # The joins over parts can repeat a row: match on ids, then read once.
    matching = Transaction.objects.filter(pk__in=rows.values("pk"))
    total = matching.count()
    page = _ledger().filter(pk__in=matching.values("pk")).order_by("-date", "-id")
    if after:
        day, pk = after
        page = page.filter(Q(date__lt=day) | Q(date=day, id__lt=pk))
    found = list(page[: limit + 1])
    more = len(found) > limit
    found = found[:limit]
    return {
        "total": total,
        "transactions": [_row(t) for t in found],
        "next_cursor": _encode_cursor(found[-1]) if more else None,
    }


@tool(
    "get_transaction",
    "One transaction",
    """
    One transaction by id: everything search_transactions gives, plus its split parts (each with amount,
    category and notes), the other account of a transfer, and whether its category was confirmed by someone
    or only guessed by the app.
    """,
    [Arg("id", "integer", "The transaction's id.", required=True)],
)
def get_transaction(id):
    txn = _ledger().filter(pk=id).first()
    if txn is None:
        raise ToolError(f"There is no transaction with id {id}.")
    counterpart = txn.transfer_counterpart
    return {
        **_row(txn),
        "category_confirmed": txn.category_confirmed,
        "category_source": txn.category_source or None,
        "transfer_account": counterpart.account.name if counterpart else None,
        "split_of": txn.split_parent_id,
        "parts": [
            {
                "id": p.id,
                "amount": fmt.money(p.amount_cents),
                "category": _category_label(p.category),
                "category_id": p.category_id,
                "notes": p.notes,
                "transfer_account": p.transfer_counterpart.account.name if p.transfer_counterpart_id else None,
            }
            for p in txn.parts.all()
        ],
    }

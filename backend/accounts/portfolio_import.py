"""Setting an investment account's value from a Portfolio Performance export.
See openspec/specs/portfolio-value-import.

The preview works from the upload alone and keeps nothing, so the save only
gets the numbers back, and the file is gone by then.
"""

from django.db import transaction as db_transaction
from django.utils import timezone

from transactions.adjustments import AdjustmentError, set_value
from transactions.models import Transaction

from .models import Account
from .portfolio_file import PortfolioFileError, read_portfolio_file

MAX_FILE_BYTES = 25 * 1024 * 1024


def _check_account(account):
    if account.account_type != Account.AccountType.INVESTMENT or account.archived:
        raise AdjustmentError("Only an active investment account can import a portfolio.")


def preview(account, upload):
    """What the uploaded export would set `account` to, as the API's answer."""
    _check_account(account)
    if upload is None:
        raise PortfolioFileError("Choose a file to import.")
    if upload.size > MAX_FILE_BYTES:
        raise PortfolioFileError("This file is larger than 25 MB, too large for a Portfolio Performance export.")
    file = read_portfolio_file(upload.read())

    dates = [holding.price_date for holding in file.holdings]
    today = timezone.localdate()
    value_date = min(max(dates), today) if dates else today
    excluded = set(account.portfolio_excluded_cash)
    return {
        "holdings_cents": sum(holding.value_cents for holding in file.holdings),
        "holdings_count": len(file.holdings),
        "oldest_price_date": min(dates, default=None),
        "newest_price_date": max(dates, default=None),
        "value_date": value_date,
        "cash": [
            {"id": cash.id, "name": cash.name, "balance_cents": cash.balance_cents, "included": cash.id not in excluded}
            for cash in file.cash_accounts
            if cash.balance_cents != 0
        ],
        "current_balance_cents": account.current_balance_cents,
        "has_later_value": Transaction.objects.filter(
            account=account, is_adjustment=True, date__gt=value_date
        ).exists(),
    }


@db_transaction.atomic
def save(account, date, value_cents, excluded_cash_ids):
    """Set the value from a preview and remember what was left out."""
    _check_account(account)
    adjustment = set_value(account, date, value_cents)
    account.portfolio_excluded_cash = excluded_cash_ids
    account.save(update_fields=["portfolio_excluded_cash", "updated_at"])
    return adjustment

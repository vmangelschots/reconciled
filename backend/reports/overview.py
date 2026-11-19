"""Every figure the overview shows for one month across all active accounts -
see openspec/specs/overview. The Overview page and the MCP get_overview tool
both call month_overview, so the two can't disagree."""

from django.db.models import BigIntegerField, Case, Count, Max, Q, Sum, When
from django.utils import timezone

from accounts.models import TIER_ORDER, Account, Loan, tier_position
from banksync.models import BankAccountLink, BankConnection, BankCredentials
from budgets.attention import attention_bills, attention_categories, attention_yearly
from budgets.summary import budget_rows, budget_totals, yearly_spent_cents
from budgets.utils import month_range
from budgets.yearly import yearly_rows
from imports.models import ImportSession
from transactions.categorize import needs_review, uncategorized
from transactions.covered import account_label
from transactions.loans import missed_installment
from transactions.models import Transaction

from .balances import net_worth_change
from .spending import active_transactions, month_spending

RECONNECT_WARNING_DAYS = 14
RECENT_COUNT = 8


def category_label(category):
    if category is None:
        return None
    return f"{category.parent.name} / {category.name}" if category.parent_id else category.name


def _recent_row(txn):
    category = txn.category
    counterpart = txn.transfer_counterpart
    account_name, paid_by_tab = account_label(txn)
    return {
        "id": txn.id,
        "date": txn.date,
        "payee": txn.payee,
        "amount_cents": txn.amount_cents,
        "account_name": account_name,
        "paid_by_tab": paid_by_tab,
        "category_label": category_label(category),
        "is_tab": bool(category and category.parent_id and category.parent.is_tab_group),
        "transfer_account_name": counterpart.account.name if counterpart else None,
        "part_count": txn.part_count,
    }


def _attention_missed_loans(today):
    """Loans whose latest installment past the matching window has no
    payment - see the overview spec's "Missed loan payments"."""
    missed = []
    loans = Loan.objects.filter(account__archived=False).select_related("account", "paid_from")
    for loan in sorted(loans, key=lambda l: l.account.name):
        installment = missed_installment(loan, today)
        if installment is not None:
            missed.append(
                {
                    "account_id": loan.account_id,
                    "name": loan.account.name,
                    "date": installment.date,
                    "installment": installment.number,
                    "term_months": loan.term_months,
                    "payment_cents": installment.payment_cents,
                    "paid_from_name": loan.paid_from.name,
                }
            )
    return missed


def _link_ended(link):
    return link.connection is None or link.connection.ended


def _last_import_date(last_import, link):
    """The later of the last file import and the last successful sync."""
    moments = [m for m in (last_import, link and link.last_synced_at) if m]
    return timezone.localdate(max(moments)) if moments else None


def _attention_reconnect():
    """Banks whose consent ended or ends within RECONNECT_WARNING_DAYS, and
    any restored link that hasn't got a connection yet. See
    openspec/specs/overview."""
    today = timezone.localdate()
    rows = []
    for connection in BankConnection.objects.all():
        days_left = (timezone.localdate(connection.valid_until) - today).days
        if connection.ended and days_left > 0:
            # The bank ended it early.
            days_left = 0
        if connection.ended or days_left <= RECONNECT_WARNING_DAYS:
            rows.append(
                {"bank_name": connection.bank_name, "days_left": days_left, "ended": connection.ended}
            )
    waiting = BankAccountLink.objects.filter(connection__isnull=True, account__archived=False)
    for bank_name in sorted(set(waiting.values_list("bank_name", flat=True))):
        rows.append({"bank_name": bank_name, "days_left": None, "ended": True})
    return rows


def import_freshness(accounts):
    """{account id: {last_import_date, bank_linked, bank_ended}}, for the
    stale-import line on the Overview and the Forecast page."""
    # An import counts for every account it sent lines to, such as a
    # Revolut pocket account next to the upload's account.
    last_imports = dict(
        ImportSession.objects.filter(imported_accounts__in=accounts, status=ImportSession.Status.COMMITTED)
        .values("imported_accounts")
        .annotate(last=Max("updated_at"))
        .values_list("imported_accounts", "last")
    )
    links = {link.account_id: link for link in BankAccountLink.objects.select_related("connection")}
    return {
        a.id: {
            "last_import_date": _last_import_date(last_imports.get(a.id), links.get(a.id)),
            "bank_linked": a.id in links,
            "bank_ended": a.id in links and _link_ended(links[a.id]),
        }
        for a in accounts
    }



def month_overview(month, today):
    """Callers bring loan matches up to date first (sync_loans)."""
    current = month == today.replace(day=1)
    month_end = month_range(month)

    accounts = list(Account.objects.visible().filter(archived=False).order_by(tier_position(), "name", "id"))
    freshness = import_freshness(accounts)
    last_values = dict(
        Transaction.objects.filter(account__in=accounts, is_adjustment=True)
        .values("account")
        .annotate(last=Max("date"))
        .values_list("account", "last")
    )
    account_rows = [
        {
            "id": a.id,
            "name": a.name,
            "account_type": a.account_type,
            "tier": a.tier,
            "balance_cents": a.current_balance_cents,
            **freshness[a.id],
            "last_value_date": last_values.get(a.id),
        }
        for a in accounts
    ]
    # Per tier, in tier order, for the tiers that have an account - see
    # the overview spec's "Everyday money and net worth".
    tier_totals = {}
    for row in account_rows:
        tier_totals[row["tier"]] = tier_totals.get(row["tier"], 0) + row["balance_cents"]
    tiers = [{"tier": t, "balance_cents": tier_totals[t]} for t in TIER_ORDER if t in tier_totals]

    in_month = active_transactions().filter(date__gte=month, date__lt=month_end)
    totals = in_month.aggregate(
        money_in=Sum(Case(When(amount_cents__gt=0, then="amount_cents"), default=0, output_field=BigIntegerField())),
        money_out=Sum(Case(When(amount_cents__lt=0, then="amount_cents"), default=0, output_field=BigIntegerField())),
    )

    rows = budget_rows(month, today)
    yearly = yearly_rows(month, today)
    yearly_spent = yearly_spent_cents(month)
    _, uncategorized_cents = month_spending(month)
    days_in_month = (month_end - month).days
    pace = today.day / days_in_month if current else None

    # A transfer between two active accounts is listed once, by its
    # outgoing leg.
    # Covered entries show once, by their cost (see repayment-tabs).
    recent = (
        Transaction.objects.ledger_rows()
        .filter(Q(account__in=accounts) | Q(account__is_off_bank=True, covered_tab_row__isnull=False))
        .excluding_adjustments()
        .exclude(amount_cents__gt=0, transfer_counterpart__account__archived=False)
        .select_related(
            "account", "category__parent", "transfer_counterpart__account", "covered_tab_row__category"
        )
        .annotate(part_count=Count("parts"))
        .order_by("-date", "-id")[:RECENT_COUNT]
    )

    return {
        "has_transactions": Transaction.objects.exists(),
        "month": month.strftime("%Y-%m"),
        "balance_cents": sum(a["balance_cents"] for a in account_rows),
        "everyday_cents": tier_totals.get("everyday", 0),
        "tiers": tiers,
        "net_worth_change_cents": net_worth_change(month, today),
        "accounts": account_rows,
        "in_out": {
            "in_cents": totals["money_in"] or 0,
            "out_cents": -(totals["money_out"] or 0),
        },
        "budget": {
            **budget_totals(rows, pace),
            "uncategorized_cents": uncategorized_cents,
            "yearly_spent_cents": yearly_spent,
            "pace": pace,
            "days_left": days_in_month - today.day + 1 if current else None,
        },
        "attention": {
            "review_count": needs_review().count(),
            "uncategorized_count": uncategorized().count(),
            "categories": attention_categories(rows, pace),
            "yearly": attention_yearly(yearly, current),
            "bills": attention_bills(rows),
            "missed_loans": _attention_missed_loans(today),
            "reconnect": _attention_reconnect(),
            "bank_sync_stopped": BankCredentials.objects.filter(stopped=True).exists(),
        },
        "recent": [_recent_row(t) for t in recent],
    }

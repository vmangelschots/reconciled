from datetime import date, timedelta

from django.db.models import BigIntegerField, Case, Count, Max, Sum, When
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import TIER_ORDER, Account, Loan, tier_position
from budgets.models import Category
from budgets.summary import budget_rows
from budgets.utils import month_range, parse_month
from budgets.yearly import yearly_rows, yearly_spent_cents
from forecasting.utils import generate_forecast
from imports.models import ImportSession
from transactions.categorize import needs_review, uncategorized
from transactions.loans import missed_installment, sync_loans
from transactions.models import Transaction

from .balances import (
    PROJECTION_DAYS,
    daily_balances,
    history_tier,
    month_end_balances,
    net_worth_change,
    tier_balance,
)
from .spending import active_transactions, month_spending

CASH_FLOW_MONTHS = 12


def _month_param(request, name):
    """Parse a required YYYY-MM query param; returns (date, error_response)."""
    value = request.query_params.get(name)
    if not value:
        return None, Response({"detail": f"{name} query param (YYYY-MM) is required."}, status=400)
    try:
        month = parse_month(value)
        if month is None:
            raise ValueError(value)
    except ValueError:
        return None, Response({"detail": f"{name} must be in YYYY-MM format."}, status=400)
    return month, None


def _shift_months(month, delta):
    index = month.year * 12 + (month.month - 1) + delta
    return date(index // 12, index % 12 + 1, 1)


class CashFlowView(APIView):
    """Money in vs money out per month, for the 12 months ending at `end`."""

    def get(self, request):
        end, error = _month_param(request, "end")
        if error:
            return error
        start = _shift_months(end, -(CASH_FLOW_MONTHS - 1))

        rows = (
            active_transactions()
            .filter(date__gte=start, date__lt=month_range(end))
            .annotate(month=TruncMonth("date"))
            .values("month")
            .annotate(
                money_in=Sum(
                    Case(When(amount_cents__gt=0, then="amount_cents"), default=0, output_field=BigIntegerField())
                ),
                money_out=Sum(
                    Case(When(amount_cents__lt=0, then="amount_cents"), default=0, output_field=BigIntegerField())
                ),
            )
        )
        totals = {row["month"]: row for row in rows}

        months = []
        for i in range(CASH_FLOW_MONTHS):
            month = _shift_months(start, i)
            row = totals.get(month, {})
            months.append(
                {
                    "month": month.strftime("%Y-%m"),
                    "in_cents": row.get("money_in") or 0,
                    "out_cents": -(row.get("money_out") or 0),
                }
            )
        return Response({"months": months})


class CategorySpendingView(APIView):
    """Net outflow per category for one month, subcategories rolled into
    their parent. Refunds reduce a category's spending; uncategorized
    spending counts outflows only, since uncategorized inflows are
    usually income."""

    def get(self, request):
        month, error = _month_param(request, "month")
        if error:
            return error
        spent, uncategorized = month_spending(month)

        categories = list(Category.objects.all())
        children = {}
        for c in categories:
            if c.parent_id is not None:
                children.setdefault(c.parent_id, []).append(c)

        result = []
        for parent in (c for c in categories if c.parent_id is None):
            direct = spent.get(parent.id, 0)
            subs = [
                {"category_id": c.id, "name": c.name, "spent_cents": spent.get(c.id, 0)}
                for c in children.get(parent.id, [])
            ]
            total = direct + sum(s["spent_cents"] for s in subs)
            if total <= 0:
                continue
            result.append(
                {
                    "category_id": parent.id,
                    "name": parent.name,
                    "spent_cents": total,
                    "direct_cents": direct,
                    "subcategories": sorted(
                        (s for s in subs if s["spent_cents"] > 0), key=lambda s: -s["spent_cents"]
                    ),
                }
            )
        result.sort(key=lambda r: -r["spent_cents"])

        return Response(
            {"month": month.strftime("%Y-%m"), "categories": result, "uncategorized_cents": uncategorized}
        )


def _today():
    """Today's date; a function so tests can freeze it."""
    return timezone.localdate()


def _projection(tier, today):
    """The active accounts' forecasts added up, as (points, lowest), or
    (None, None) with nothing scheduled. It starts from history's balance
    today: an account's current balance also counts rows dated later."""
    accounts = [a for a in Account.objects.filter(archived=False) if a.tier == tier]
    forecasts = [generate_forecast(a, PROJECTION_DAYS, today) for a in accounts]
    if not any(f["occurrences"] for f in forecasts):
        return None, None
    balance = tier_balance(tier, today)
    points = [
        {
            "date": today + timedelta(days=offset),
            "balance_cents": balance
            + sum(f["points"][offset]["balance_cents"] - f["starting_balance_cents"] for f in forecasts),
        }
        for offset in range(PROJECTION_DAYS + 1)
    ]
    return points, min(points[1:], key=lambda p: p["balance_cents"])


class EverydayBalanceView(APIView):
    """The everyday balance per day up to the chosen month's end, or today
    and the projection after it - see openspec/specs/balance-history."""

    def get(self, request):
        month, error = _month_param(request, "month")
        if error:
            return error
        today = _today()
        sync_loans(today)
        current = month == today.replace(day=1)
        end = min(month_range(month) - timedelta(days=1), today)
        tier = history_tier()
        points, lowest = _projection(tier, today) if current else (None, None)
        return Response(
            {
                "tier": tier,
                "current": current,
                "end": end,
                "points": daily_balances(tier, end),
                "projection": points,
                "lowest": lowest,
            }
        )


class NetWorthView(APIView):
    """Every account's balance per tier at each month's end - see
    openspec/specs/balance-history."""

    def get(self, request):
        today = _today()
        sync_loans(today)
        return Response({"months": month_end_balances(today)})


# A category this close to its limit is a warning once it is also ahead
# of the month's pace - see openspec/specs/overview.
WARNING_SHARE = 85
RECENT_COUNT = 8


def _attention_categories(rows, pace):
    """Over-limit categories (most euros over first), then - for the
    current month, when `pace` is set - those at 85% or more and ahead of
    the month's pace (highest share first). Shares are rounded down."""
    names = {row["category_id"]: row["category_name"] for row in rows}
    over, warn = [], []
    for row in rows:
        limit = row["limit_cents"]
        if not limit or limit <= 0:
            continue
        spent = row["spent_cents"]
        share = spent * 100 // limit
        item = {
            "id": row["category_id"],
            "name": row["category_name"],
            "parent_name": names.get(row["parent_id"]),
            "spent_cents": spent,
            "limit_cents": limit,
            "share": share,
            "over": spent > limit,
        }
        if spent > limit:
            over.append(item)
        elif pace is not None and share >= WARNING_SHARE and share > pace * 100:
            warn.append(item)
    over.sort(key=lambda c: -(c["spent_cents"] - c["limit_cents"]))
    warn.sort(key=lambda c: -c["share"])
    return over + warn


# Yearly warnings, most pressing first - see openspec/specs/overview.
YEARLY_ORDER = ["overdue", "over", "partly_paid", "not_seen", "ahead", "due_soon"]


def _attention_yearly(yearly, current):
    """Yearly budgets and targets that need attention in the chosen month.
    Due soon and ahead of pace are early warnings, so only for the current
    month; a target paid within its tolerance is never listed."""
    names = {}
    items = []
    for row in yearly["categories"]:
        names[row["category_id"]] = row["category_name"]
        if row["kind"] == "target":
            state = "over" if row["state"] == "paid_over" else row["state"]
        elif row["over"]:
            state = "over"
        elif row["ahead"]:
            state = "ahead"
        else:
            continue
        if state not in YEARLY_ORDER or (not current and state in ("due_soon", "ahead")):
            continue
        items.append(
            {
                "id": row["category_id"],
                "name": row["category_name"],
                "parent_id": row["parent_id"],
                "kind": row["kind"],
                "state": state,
                "share": row["spent_cents"] * 100 // row["budget_cents"] if row["budget_cents"] > 0 else None,
                "spent_cents": row["spent_cents"],
                "budget_cents": row["budget_cents"],
                "due_date": row["due_date"],
            }
        )
    parents = dict(Category.objects.filter(id__in={i["parent_id"] for i in items if i["parent_id"]}).values_list("id", "name"))
    for item in items:
        item["parent_name"] = parents.get(item.pop("parent_id"))
    items.sort(
        key=lambda i: (
            YEARLY_ORDER.index(i["state"]),
            -(i["spent_cents"] - i["budget_cents"]) if i["state"] == "over" else 0,
            -(i["share"] or 0) if i["state"] == "ahead" else 0,
        )
    )
    return items


def _category_label(category):
    if category is None:
        return None
    return f"{category.parent.name} / {category.name}" if category.parent_id else category.name


def _recent_row(txn):
    category = txn.category
    counterpart = txn.transfer_counterpart
    return {
        "id": txn.id,
        "date": txn.date,
        "payee": txn.payee,
        "amount_cents": txn.amount_cents,
        "account_name": txn.account.name,
        "category_label": _category_label(category),
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


class OverviewView(APIView):
    """Every figure the overview shows for one month across all active
    accounts, in one request - see openspec/specs/overview."""

    def get(self, request):
        month, error = _month_param(request, "month")
        if error:
            return error

        today = _today()
        current = month == today.replace(day=1)
        month_end = month_range(month)
        sync_loans(today)

        accounts = list(Account.objects.filter(archived=False).order_by(tier_position(), "name", "id"))
        # An import counts for every account it sent lines to, such as a
        # Revolut pocket account next to the upload's account.
        last_imports = dict(
            ImportSession.objects.filter(imported_accounts__in=accounts, status=ImportSession.Status.COMMITTED)
            .values("imported_accounts")
            .annotate(last=Max("updated_at"))
            .values_list("imported_accounts", "last")
        )
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
                "last_import_date": timezone.localdate(last_imports[a.id]) if a.id in last_imports else None,
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

        rows = budget_rows(month)
        yearly = yearly_rows(month, today)
        yearly_spent = yearly_spent_cents(month)
        limited = [r for r in rows if r["limit_cents"] is not None]
        _, uncategorized_cents = month_spending(month)
        days_in_month = (month_end - month).days
        pace = today.day / days_in_month if current else None

        # A transfer between two active accounts is listed once, by its
        # outgoing leg.
        recent = (
            Transaction.objects.ledger_rows()
            .filter(account__in=accounts)
            .excluding_adjustments()
            .exclude(amount_cents__gt=0, transfer_counterpart__account__archived=False)
            .select_related("account", "category__parent", "transfer_counterpart__account")
            .annotate(part_count=Count("parts"))
            .order_by("-date", "-id")[:RECENT_COUNT]
        )

        return Response(
            {
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
                    "has_limits": bool(limited),
                    "limit_cents": sum(r["limit_cents"] for r in limited),
                    "spent_cents": sum(r["spent_cents"] for r in limited),
                    "outside_cents": sum(
                        r["spent_cents"] for r in rows if r["limit_cents"] is None and r["spent_cents"] > 0
                    ),
                    "uncategorized_cents": uncategorized_cents,
                    "yearly_spent_cents": yearly_spent,
                    "pace": pace,
                    "days_left": days_in_month - today.day + 1 if current else None,
                },
                "attention": {
                    "review_count": needs_review().count(),
                    "uncategorized_count": uncategorized().count(),
                    "categories": _attention_categories(rows, pace),
                    "yearly": _attention_yearly(yearly, current),
                    "missed_loans": _attention_missed_loans(today),
                },
                "recent": [_recent_row(t) for t in recent],
            }
        )

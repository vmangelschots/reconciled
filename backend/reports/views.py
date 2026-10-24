from datetime import date

from django.db.models import BigIntegerField, Case, Count, Max, Sum, When
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account
from budgets.models import Category
from budgets.summary import budget_rows
from budgets.utils import month_range, parse_month
from imports.models import ImportSession
from transactions.categorize import needs_review, uncategorized
from transactions.models import Transaction

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

        accounts = list(Account.objects.filter(archived=False).order_by("name", "id"))
        last_imports = dict(
            ImportSession.objects.filter(account__in=accounts, status=ImportSession.Status.COMMITTED)
            .values("account_id")
            .annotate(last=Max("updated_at"))
            .values_list("account_id", "last")
        )
        account_rows = [
            {
                "id": a.id,
                "name": a.name,
                "balance_cents": a.current_balance_cents,
                "last_import_date": timezone.localdate(last_imports[a.id]) if a.id in last_imports else None,
            }
            for a in accounts
        ]

        in_month = active_transactions().filter(date__gte=month, date__lt=month_end)
        totals = in_month.aggregate(
            money_in=Sum(Case(When(amount_cents__gt=0, then="amount_cents"), default=0, output_field=BigIntegerField())),
            money_out=Sum(Case(When(amount_cents__lt=0, then="amount_cents"), default=0, output_field=BigIntegerField())),
        )

        rows = budget_rows(month)
        limited = [r for r in rows if r["limit_cents"] is not None]
        _, uncategorized_cents = month_spending(month)
        days_in_month = (month_end - month).days
        pace = today.day / days_in_month if current else None

        # A transfer between two active accounts is listed once, by its
        # outgoing leg.
        recent = (
            Transaction.objects.ledger_rows()
            .filter(account__in=accounts)
            .exclude(amount_cents__gt=0, transfer_counterpart__account__archived=False)
            .select_related("account", "category__parent", "transfer_counterpart__account")
            .annotate(part_count=Count("parts"))
            .order_by("-date", "-id")[:RECENT_COUNT]
        )

        return Response(
            {
                "month": month.strftime("%Y-%m"),
                "balance_cents": sum(a["balance_cents"] for a in account_rows),
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
                    "pace": pace,
                    "days_left": days_in_month - today.day + 1 if current else None,
                },
                "attention": {
                    "review_count": needs_review().count(),
                    "uncategorized_count": uncategorized().count(),
                    "categories": _attention_categories(rows, pace),
                },
                "recent": [_recent_row(t) for t in recent],
            }
        )

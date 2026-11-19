"""The overview, reports, forecast, year plan, net worth, loans and tabs. Each
calls the function behind its page - see design.md D3/D4 of mcp-read-access."""

from accounts.models import Loan
from accounts.views import _schedule_body
from budgets import utils
from budgets.plans import year_view
from forecasting.forecast import everyday_forecast
from reports.balances import month_end_balances
from reports.overview import month_overview
from reports.report import months_in, spending_report
from reports.views import MAX_REPORT_MONTHS
from transactions import tabs

from .. import format as fmt
from ..registry import Arg, ToolError, current_month, tool

DEFAULT_FORECAST_DAYS = 90
MAX_FORECAST_DAYS = 365
DEFAULT_NET_WORTH_MONTHS = 12


@tool(
    "get_overview",
    "Month overview",
    """
    A month at a glance, with the same figures as the Overview page: the total balance and everyday money,
    balances per tier and per account, net worth change, money in and out, the budget's totals and pace, what
    needs attention (over-limit or ahead-of-pace budgets, missed bills and loan payments, transactions to
    review or categorize, bank connections to renew) and the most recent transactions.
    """,
    [Arg("month", "month", "The month, YYYY-MM. Defaults to the current month.")],
)
def get_overview(month=None):
    return fmt.present(month_overview(month or current_month(), utils.today()))


@tool(
    "get_spending_report",
    "Spending report",
    f"""
    The spending report for whole months from start to end (at most {MAX_REPORT_MONTHS} months, not past this
    month), as the Reports page shows it: per category and month what went out, with income, totals, the
    saving rate and the monthly averages. Tabs, transfers and value adjustments aren't spending.
    """,
    [
        Arg("start", "month", "The first month, YYYY-MM.", required=True),
        Arg("end", "month", "The last month, YYYY-MM. Defaults to the current month."),
    ],
)
def get_spending_report(start, end=None):
    today = utils.today()
    end = end or current_month()
    if end < start or end > today.replace(day=1):
        raise ToolError("The period must end on or after its start, and not past this month.")
    if len(months_in(start, end)) > MAX_REPORT_MONTHS:
        raise ToolError(f"A period can be at most {MAX_REPORT_MONTHS} months.")
    return fmt.present(spending_report(start, end, today))


@tool(
    "get_forecast",
    "Forecast",
    """
    The Everyday forecast, as the Forecast page shows it: the everyday money balance projected day by day for
    `days` ahead, from today's balance, and the items coming up in that time - bills, loan installments,
    expected income and payments, and what's left of the budgets, spread over the days. `missed` lists bills
    and installments that should have been paid already. `lowest` is the lowest projected balance.
    """,
    [
        Arg(
            "days",
            "integer",
            f"How many days ahead, 1 to {MAX_FORECAST_DAYS}. Defaults to {DEFAULT_FORECAST_DAYS}.",
            minimum=1,
            maximum=MAX_FORECAST_DAYS,
        )
    ],
)
def get_forecast(days=DEFAULT_FORECAST_DAYS):
    return fmt.present(everyday_forecast(utils.today(), days))


@tool(
    "get_year_plan",
    "Year plan",
    """
    A year's Current budget plan against what actually happened, as the Year view shows it: per budget its
    plan for the year, the actual spending so far, and where it is heading by year end; the planned income
    lines with their actuals; and the year totals (income, expenses, what's left and the share saved).
    Draft plans aren't included.
    """,
    [Arg("year", "year", "The year. Defaults to this year.")],
)
def get_year_plan(year=None):
    today = utils.today()
    return {"year": year or today.year, **fmt.present(year_view(year or today.year, today))}


@tool(
    "get_net_worth_history",
    "Net worth history",
    """
    Net worth at the end of each month, in total and per tier (everyday, savings, investments, property,
    loans), as the net worth report shows it. The current month reports today's figure. Returns fewer months
    when the household's history is shorter.
    """,
    [Arg("months", "integer", "How many months back, current month included. Defaults to 12.", minimum=1, maximum=600)],
)
def get_net_worth_history(months=DEFAULT_NET_WORTH_MONTHS):
    return {"months": fmt.present(month_end_balances(utils.today())[-months:])}


@tool(
    "list_loans",
    "Loans",
    """
    The household's loans with a schedule: the loan account, principal, yearly interest rate, the installment
    in force, the balance still owed, and the dates of the next and the last installment.
    """,
)
def list_loans():
    today = utils.today()
    loans = Loan.objects.select_related("account", "paid_from").order_by("account__name", "id")
    rows = []
    for loan in loans:
        body = _schedule_body(loan, today)
        upcoming = [i for i in body["installments"] if i["date"] >= today]
        rows.append(
            {
                "account": loan.account.name,
                "account_id": loan.account_id,
                "archived": loan.account.archived,
                "principal": fmt.money(loan.principal_cents),
                "annual_rate_percent": body["annual_rate"],
                "term_months": loan.term_months,
                "installment": fmt.money(body["payment_cents"]),
                "paid_from": body["paid_from_name"],
                # The loan account's balance is negative while money is owed.
                "still_owed": fmt.money(-body["current_balance_cents"]),
                "next_installment": fmt.day(upcoming[0]["date"]) if upcoming else None,
                "last_installment": fmt.day(body["end_date"]),
                "paid_off_on": fmt.day(body["paid_off_on"]),
            }
        )
    return {"loans": rows}


def _worded(name, cents):
    """repayment-tabs, "Balances are worded, never signed"."""
    if cents > 0:
        return f"{name} owes you {fmt.money(cents)}"
    if cents < 0:
        return f"You owe {name} {fmt.money(-cents)}"
    return "Settled"


@tool(
    "list_tabs",
    "Tabs",
    """
    The household's tabs: money a person owes you or you owe them, largest first. Each balance is worded
    ("Jan owes you 30.00 EUR", "You owe Jan 5.00 EUR" or "Settled"), with the date it has been open since.
    """,
)
def list_tabs():
    return {
        "tabs": [
            {
                "id": s.category.id,
                "name": s.category.name,
                "group": s.category.parent.name,
                "balance": _worded(s.category.name, s.balance_cents),
                "owed_to_you": fmt.money(s.balance_cents),
                "open_since": fmt.day(s.open_since),
            }
            for s in tabs.balances()
        ]
    }

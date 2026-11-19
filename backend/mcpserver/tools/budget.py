"""The month's budget. See openspec/specs/mcp-server, "A month's budget"."""

from budgets import utils
from budgets.models import Category
from budgets.month import month_budget

from .. import format as fmt
from ..registry import Arg, current_month, tool
from .reference import KIND_NAMES


def _kind(row):
    row = dict(row)
    if "kind" in row:
        row["kind"] = KIND_NAMES.get(row["kind"], row["kind"])
    return row


@tool(
    "get_budget",
    "Month budget",
    """
    A month's budget, with the same figures as the Budgets page. For each monthly or bills category: its limit,
    spent, remaining and whether it is over. A parent with a limit covers its subcategories (covers_subcategories),
    so a covered subcategory's spending is already in its parent and isn't counted again in the totals; a
    subcategory's own limit is then only a cap inside its parent. Bills categories list each bill with its state
    (paid, due, late, missed). Yearly and yearly-on-a-date budgets are under `yearly`, with the year's amount and
    what was spent so far. For the current month, `pace` is the share of the month passed and totals.marker is
    where spending is expected to be by today as a share of the limits (bills due so far plus the passed share of
    every other limit). `attention` lists what is over, ahead of pace, or missed.
    """,
    [Arg("month", "month", "The month, YYYY-MM. Defaults to the current month.")],
)
def get_budget(month=None):
    month = month or current_month()
    budget = month_budget(month, utils.today())
    budget["categories"] = [_kind(r) for r in budget["categories"]]
    budget["yearly"] = {**budget["yearly"], "categories": [_kind(r) for r in budget["yearly"]["categories"]]}
    return {"month": fmt.month(month), **fmt.present(budget)}

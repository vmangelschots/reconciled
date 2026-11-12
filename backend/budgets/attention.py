"""Which budgets need attention in a month, shared by the overview and the
Budgets page so the two can't disagree - see openspec/specs/overview."""

from .models import Category

# A category this close to its limit is a warning once it is also ahead
# of the month's pace - see openspec/specs/overview.
WARNING_SHARE = 85


def attention_categories(rows, pace):
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
        # Bills are paid in one go, so they are never ahead of the month's
        # pace, and over only beyond a small margin - see
        # openspec/specs/bill-budgets.
        if row["kind"] == Category.BudgetKind.BILLS:
            item["over"] = row["over_limit"]
            if row["over_limit"]:
                over.append(item)
            continue
        if spent > limit:
            over.append(item)
        elif pace is not None and share >= WARNING_SHARE and share > pace * 100:
            warn.append(item)
    over.sort(key=lambda c: -(c["spent_cents"] - c["limit_cents"]))
    warn.sort(key=lambda c: -c["share"])
    return over + warn


def attention_bills(rows):
    """Missed bills in the month, earliest first - see
    openspec/specs/bill-budgets. Bills due soon or not seen yet wait."""
    names = {row["category_id"]: row["category_name"] for row in rows}
    items = [
        {
            "category_id": row["category_id"],
            "category_name": row["category_name"],
            "parent_name": names.get(row["parent_id"]),
            "bill_id": bill["id"],
            "name": bill["name"],
            "due_date": bill["due_date"],
            "amount_cents": bill["amount_cents"],
        }
        for row in rows
        if row["kind"] == Category.BudgetKind.BILLS
        for bill in row["bills"]
        # A missed loan bill is the loan's own missed payment line.
        if bill["state"] == "missed" and bill["source"] != "loan"
    ]
    items.sort(key=lambda i: (i["due_date"], i["name"]))
    return items


# Yearly warnings, most pressing first - see openspec/specs/overview.
YEARLY_ORDER = ["overdue", "over", "partly_paid", "not_seen", "ahead", "due_soon"]


def attention_yearly(yearly, current):
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

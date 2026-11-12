"""Which categories take their budget from loans, and switching a category
to that and back - see openspec/specs/bill-budgets and loan-schedules.

Only models are imported here, so transactions/loans.py can call adopt and
release without an import cycle.
"""

from accounts.models import Loan

from .models import Category


def active_loans():
    """Loans on active accounts: the only ones that set a budget."""
    return Loan.objects.filter(account__archived=False)


def loan_categories():
    """Ids of the categories some active loan pays into."""
    return set(active_loans().exclude(payment_category=None).values_list("payment_category_id", flat=True))


def adopt(category):
    """The loans now set `category`'s budget: whatever it had goes."""
    if category is None:
        return
    category.limits.all().delete()
    category.yearly_budgets.all().delete()
    category.bills.all().delete()
    if category.budget_kind != Category.BudgetKind.BILLS:
        category.budget_kind = Category.BudgetKind.BILLS
        category.save(update_fields=["budget_kind", "updated_at"])


def release(category_id):
    """Once no active loan pays into it, a loan category goes back to a
    monthly category without a limit: no budget."""
    if category_id is None or active_loans().filter(payment_category_id=category_id).exists():
        return
    Category.objects.filter(id=category_id, budget_kind=Category.BudgetKind.BILLS).update(
        budget_kind=Category.BudgetKind.MONTHLY
    )

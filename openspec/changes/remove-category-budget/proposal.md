# Proposal

## Why

Once a category has a budget, there is no way to take it away. A monthly
limit can only be replaced (setting 0.00 gives a limit of zero, which reads
as over budget), a yearly amount can only be changed, and a month override
can never go back to the default. The only way back to "No budget" is to
delete the category, which is blocked as soon as it has transactions.

Issue: to be filed (`bug`/`enhancement` on the Reconciled board).

## What Changes

- The budget editor in the budget sheet gets a **Remove budget** action for
  a category that has a budget of any kind (monthly, yearly, on a date,
  bills). After a confirmation dialog that says what will be removed, the
  category's monthly limits and overrides, yearly amounts and their history,
  and bills are deleted, and it goes back to being a monthly category
  without a limit: it shows under "No budget" like a new category.
- A parent whose budget is removed becomes a plain group, so its
  subcategories' budgets stand on their own (follows from the existing
  "A parent's budget covers its subcategories" requirement).
- When the viewed month has its own override of a monthly limit, the
  editor offers **Use default** (showing the default amount, or "no limit"
  when there is none), which deletes that month's override so the month
  falls back to the default. No confirmation; it is easily redone.
- New API: `DELETE /api/categories/{id}/budget/` removes the whole budget;
  `DELETE /api/categories/{id}/limit/?month=YYYY-MM` removes one month's
  override. Both refuse tabs and loan categories, as setting a budget does.
- Loan categories keep their budget from their loans and get no Remove
  action.

Out of scope: removing only the default monthly limit while keeping
overrides, and ending bills from a month on without deleting their history
(the existing bill editor already ends removed bills from the viewed month).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `budgets`: new requirements to remove a category's budget and to remove a
  month's override.
- `budget-overview`: the budget sheet offers Remove budget and closes on it
  like on save.

## Impact

- Backend: `backend/budgets/views.py` (`CategoryViewSet`: DELETE on the
  `budget` and `limit` actions), tests in `backend/budgets/tests.py`.
- Frontend: `frontend/src/api/categories.js` (two new calls),
  `frontend/src/components/BudgetEditor.jsx` (Remove budget + dialog, Use
  default), `frontend/src/components/BudgetSheet.jsx` (pass `overridden`,
  removal for Bills sheets), `frontend/src/pages/BudgetsPage.jsx` (toast
  text after removal), tests alongside.
- No migrations; no change to the summary maths, which already handles
  categories without a budget.

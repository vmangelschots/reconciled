# Proposal

## Why

Once a category has a budget, there is no way to take it away. A monthly
limit can only be replaced (setting 0.00 gives a limit of zero, which reads
as over budget), a yearly amount can only be changed, and a month override
can never go back to the default. The only way back to "No budget" is to
delete the category, which is blocked as soon as it has transactions.

Issue: #75

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
  editor offers **Use default** (showing the default amount), or **Remove
  <Month>'s limit** when there is no default, which deletes that month's override so the month
  falls back to the default. No confirmation; it is easily redone.
- New API: `DELETE /api/categories/{id}/budget/` removes the whole budget;
  `DELETE /api/categories/{id}/limit/?month=YYYY-MM` removes one month's
  override. Both refuse tabs and loan categories, as setting a budget does.
- Loan categories keep their budget from their loans and get no Remove
  action.
- The removal dialog describes the saved budget, says it applies to every
  month, and names the subcategories that keep their own budgets when a
  parent's budget goes. A Bills category also offers Remove budget next to
  Edit bills.
- Use default's toast offers Undo, which puts the month's own limit back.
- After a removal the "No budget" group opens on the highlighted row.
- Fixes found in review: with the viewed month on its own limit, "This month
  only" starts ticked, so editing the amount changes that month and not the
  default; typing 0 as a monthly amount says that 0 means nothing may be
  spent and points to Remove budget.
- The forecast's refusal of an expected item whose category has a budget
  says that removing the budget lets it be expected.

Out of scope: removing only the default monthly limit while keeping
overrides, and ending bills from a month on without deleting their history
(the existing bill editor already ends removed bills from the viewed month).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `budgets`: new requirements to remove a category's budget and to remove a
  month's override.
- `budget-overview`: the budget sheet offers Remove budget (also in a Bills
  sheet's header), Use default with Undo, and opens the No budget group on
  the removed row; editing a month with its own limit starts on "This month
  only"; a 0 amount gets a hint.
- `forecasting`: the refusal for a budgeted category points to removing its
  budget.

## Impact

- Backend: `backend/budgets/views.py` (`CategoryViewSet`: DELETE on the
  `budget` and `limit` actions), tests in `backend/budgets/tests.py`.
- Frontend: `frontend/src/api/categories.js` (two new calls),
  `frontend/src/components/BudgetEditor.jsx` (Remove budget + dialog, Use
  default), `frontend/src/components/BudgetSheet.jsx` (pass `overridden`,
  removal for Bills sheets), `frontend/src/pages/BudgetsPage.jsx` (toast
  text after removal), tests alongside.
- `frontend/src/components/ui/Toast.jsx` (an optional action on a success
  toast), `backend/forecasting/expected.py` (refusal text).
- No migrations; no change to the summary maths, which already handles
  categories without a budget.

# Tasks

## 1. Backend

- [x] 1.1 Add `DELETE /api/categories/{id}/budget/` to `CategoryViewSet` (same tab/loan guards as the PUT; in one transaction delete limits, yearly budgets and bills, set `budget_kind` to monthly; return the category); verify with tests in `backend/budgets/tests.py` for "Remove a monthly budget", "Remove a yearly budget", "Remove a Bills budget", "A parent becomes a group" (summary shows the parent as a group and the cap on its own), "Not for a loan's category" and a tab being rejected; then run `python manage.py test budgets`
- [x] 1.2 Add `DELETE /api/categories/{id}/limit/?month=YYYY-MM` (tab/loan/kind guards as the PUT; 400 without a month or on a bad month, 404 when that month has no override; return the category); verify with tests for "Back to the default", "No default to fall back to" and "No override that month"; then run `python manage.py test budgets`

## 2. Frontend

- [x] 2.1 Add `removeCategoryBudget(id)` and `removeCategoryLimit(id, month)` to `frontend/src/api/categories.js`; verify with cases in `categories.test.js` for the method and URL of each; then run `npm test`
- [x] 2.2 In `BudgetEditor`, add the Remove budget action (shown only when the category has a budget, per design) with a confirmation dialog whose text shares `droppedSentence`'s parts, and a "Use default (€X)" / "Use no limit" action for a monthly category whose viewed month is overridden; both call `onSaved` with a toast message; pass `overridden` from `BudgetSheet` (normal and Bills sheets) and use the message in `BudgetsPage.handleBudgetSaved`; verify with component tests for "Confirm the removal", "Nothing to remove", "Remove a budget from the sheet", "Remove a Bills budget from the sheet" and "Use the default for a month"; then run `npm test`, `npm run lint`, `npm run build`

## 3. Integration check

- [x] 3.1 With `/run-reconciled`, in the demo household: remove a monthly budget (row moves to No budget), remove a yearly and a Bills budget, remove a parent's budget (subcategories stand alone), and drop a month override back to the default; check the sheet at phone width too

## 4. Review follow-ups

- [x] 4.1 Change the forecast's refusal for a budgeted category to "This category's budget is already in the forecast. Remove its budget to expect it instead."; verify by updating the forecasting test that checks it; then run `python manage.py test forecasting`
- [x] 4.2 Give `toast.success` an optional `{ action: { label, onClick } }` rendered as a text button in the toast; add Undo to Use default's toast (re-PUT the month's old limit, then reload); verify with a Toast test for the action and a sheet test for "Undo Use default"; then run `npm test`
- [x] 4.3 Start "This month only" ticked when the viewed month has its own limit; show a hint under a monthly amount of 0; verify with sheet tests for "Change December's own limit", "Change the default from an ordinary month" and "Typing 0"; then run `npm test`
- [x] 4.4 Name subcategories with their own budget in the removal dialog ("Restaurant keeps its own budget."), and add Remove budget next to Edit bills in a Bills sheet's header; verify with sheet tests for "Food's subcategories" and "Remove a Bills budget from the sheet" (from the header), and the existing removal tests; then run `npm test`, `npm run lint`, `npm run build`
- [ ] 4.5 With `/run-reconciled`, check Undo on Use default, editing an overridden month, the 0 hint, the parent dialog and the Bills header action, at desktop and phone width

## Workflow follow-up

- Work on branch `change/remove-category-budget`; open a PR with `Fixes #75`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

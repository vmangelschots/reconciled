# Tasks

## 1. Backend

- [x] 1.1 Add `DELETE /api/categories/{id}/budget/` to `CategoryViewSet` (same tab/loan guards as the PUT; in one transaction delete limits, yearly budgets and bills, set `budget_kind` to monthly; return the category); verify with tests in `backend/budgets/tests.py` for "Remove a monthly budget", "Remove a yearly budget", "Remove a Bills budget", "A parent becomes a group" (summary shows the parent as a group and the cap on its own), "Not for a loan's category" and a tab being rejected; then run `python manage.py test budgets`
- [x] 1.2 Add `DELETE /api/categories/{id}/limit/?month=YYYY-MM` (tab/loan/kind guards as the PUT; 400 without a month or on a bad month, 404 when that month has no override; return the category); verify with tests for "Back to the default", "No default to fall back to" and "No override that month"; then run `python manage.py test budgets`

## 2. Frontend

- [ ] 2.1 Add `removeCategoryBudget(id)` and `removeCategoryLimit(id, month)` to `frontend/src/api/categories.js`; verify with cases in `categories.test.js` for the method and URL of each; then run `npm test`
- [ ] 2.2 In `BudgetEditor`, add the Remove budget action (shown only when the category has a budget, per design) with a confirmation dialog whose text shares `droppedSentence`'s parts, and a "Use default (€X)" / "Use no limit" action for a monthly category whose viewed month is overridden; both call `onSaved` with a toast message; pass `overridden` from `BudgetSheet` (normal and Bills sheets) and use the message in `BudgetsPage.handleBudgetSaved`; verify with component tests for "Confirm the removal", "Nothing to remove", "Remove a budget from the sheet", "Remove a Bills budget from the sheet" and "Use the default for a month"; then run `npm test`, `npm run lint`, `npm run build`

## 3. Integration check

- [ ] 3.1 With `/run-reconciled`, in the demo household: remove a monthly budget (row moves to No budget), remove a yearly and a Bills budget, remove a parent's budget (subcategories stand alone), and drop a month override back to the default; check the sheet at phone width too

## Workflow follow-up

- File a GitHub issue for this and reference it in `proposal.md`.
- Work on branch `change/remove-category-budget`; open a PR with `Fixes #N`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

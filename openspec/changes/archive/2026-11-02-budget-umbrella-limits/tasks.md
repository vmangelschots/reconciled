# Tasks

## 1. Monthly figures

- [x] 1.1 Roll up in `budget_rows`: owner rule from design.md, `spent_cents` including subcategories for a parent with a limit, and `covers_subcategories`, `covered_by_parent` and `caps_cents` on rows. Verify in `backend/budgets/tests.py` with the "A parent's budget covers its subcategories" and "A subcategory's limit is a cap inside its parent" scenarios, replacing the test for independent figures, and with a month override on the parent.
- [x] 1.2 Add `budget_totals` to `summary.py` and make `yearly_spent_cents` follow owners. Verify with tests that each euro lands in exactly one figure for: cap under a limited parent, no-limit subcategory, yearly subcategory under a monthly parent, monthly subcategory under a yearly parent, and a parent without a budget.
- [x] 1.3 Use `budget_totals` in the Budgets summary view and the Overview. Verify in `backend/reports/tests_overview.py` with the new "Budget tile" scenarios, and the two new "Category warnings follow the month's pace" scenarios.

## 2. Yearly figures

- [x] 2.1 Roll subcategories up in `yearly_rows`, for yearly and on-a-date parents, respecting the start month and the viewed month's end. Verify in `backend/budgets/tests_yearly.py` with the new scenarios in "Yearly budget" and "Yearly budget on a date", and that a target's state and a parent's pace warning use the rolled-up figure.

## 3. Budgets page

- [x] 3.1 Show the new meaning in `BudgetsPage.jsx`: "includes subcategories" on covering parents, "Covered by <parent>" in place of "No limit" on subcategories, and the note when `caps_cents` exceeds the parent's limit, on both table and phone rows, for monthly and yearly lists. Verify in `BudgetsPage.test.jsx`.
- [x] 3.2 Keep rows whose parent isn't listed in the monthly summary, shown as "Parent / Sub". Verify in `BudgetsPage.test.jsx`, and correct the "no rollup" comment in `categoryTree.js`.

## 4. Whole change

- [x] 4.1 Run `python manage.py test`, and `npm test`, `npm run lint` and `npm run build` in `frontend/`, and verify all pass.
- [x] 4.2 Check the Food example in the running app on Budgets and Overview: Food 1,000.00, Restaurant cap 100.00, spending over the cap. Verify both pages show €1,000 as the budget and Restaurant as the only warning.

## Workflow follow-up

- Archive the change on its branch before the PR is merged.
- Open the PR with `Fixes #45`, and call out in it that past months' figures change.

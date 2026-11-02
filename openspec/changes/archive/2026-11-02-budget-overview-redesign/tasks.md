# Tasks

## 1. Summary API

- [x] 1.1 Move `_attention_categories` and `_attention_yearly` to `backend/budgets/attention.py` and import them in `reports/views.py`. Verify `reports/tests_overview.py` passes unchanged.
- [x] 1.2 Add `group_spent_cents` and `overridden` to `budget_rows`. Verify in `backend/budgets/tests.py`: a parent without a budget totals direct, monthly and yearly subcategory spending for the month, and an override is flagged only in its month.
- [x] 1.3 Add `totals`, `pace`, `days_left` and `attention` to the budget summary view. Verify with API tests that totals equal the Overview's `budget` for the same month, and that pace is null for past and future months. Update the query count test.

## 2. Building blocks

- [x] 2.1 Add `tone="positive"` to `ProgressBar`, capped and never critical. Verify in `primitives.test.jsx`.
- [x] 2.2 Extract `Sheet` and an exported transaction list from `SpendingSheet.jsx`, and verify `SpendingSheet.test.jsx` passes unchanged.
- [x] 2.3 Add `lib/budgetOverview.js` turning a summary and categories into list rows: tree order across kinds, "Parent / Sub", row shapes for monthly, yearly, target, covered and group rows, captions, tones, No budget, and the verdict. Verify in `budgetOverview.test.js` with the scenarios of "One list of budgets", "Budget rows", "Rows without their own budget", "Categories without a budget collapse", "Month overrides are marked" and "Headline verdict", including tabs left out and a month before the start month.
- [x] 2.4 Give `BudgetEditor` a stacked layout, keeping its logic. Verify the existing editor tests, moved with it, still pass.

## 3. Category settings

- [x] 3.1 Add `CategoriesPage.jsx` with the moved form, tree, tab balances and history, the `/categories` route, and the Categories nav item in the "more" group. Verify in `CategoriesPage.test.jsx` by moving the category tests from `BudgetsPage.test.jsx`, and in `Layout.test.jsx` for the sidebar and More.

## 4. Budgets page

- [x] 4.1 Rewrite `BudgetsPage.jsx`: header with the Categories link and month switcher, headline, Needs a look, `BudgetRow` list, Uncategorized, the start month line with its strip and as-of date, the before-start note and the no-categories state. Verify in `BudgetsPage.test.jsx` by requirement, including the address month scenarios and that no category form is on the page.
- [x] 4.2 Add `BudgetSheet.jsx` with figures, editor, transactions and the category settings link, opened from rows and Needs a look, with highlight on save. Verify in `BudgetSheet.test.jsx` with the "Budget sheet" scenarios and the dropped-amounts dialog.

## 5. Whole change

- [x] 5.1 Run `python manage.py test`, and `npm test`, `npm run lint` and `npm run build` in `frontend/`, and verify all pass.
- [x] 5.2 Check the running app at 1280px and 390px wide with monthly, yearly, target, capped, group and no-budget categories, for the current, a past and a future month and a month before the start. Verify the headline matches the Overview tile, no row scrolls sideways, and a sheet opens at each width.

## Workflow follow-up

- Archive the change on its branch before the PR is merged.
- Open the PR with `Fixes #47`.

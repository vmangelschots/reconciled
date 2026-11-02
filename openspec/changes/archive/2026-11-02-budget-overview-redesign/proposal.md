# Proposal

Issue: #47

## Why

The budget overview is the most important thing on the Budgets page, yet it
is split between a monthly and a yearly table, with editing built into the
rows and category management below them. The page never says whether the
month is going well, and a Food budget with a yearly subcategory appears in
two places.

## What Changes

- **BREAKING** One overview replaces the "Monthly summary" and "This year"
  panels: monthly, yearly and on-a-date budgets share one category list, in a
  stable order.
- A headline gives a verdict and the same budget figures as the Overview tile.
- "Needs a look" repeats anything that needs attention, using the Overview's
  rules and wording.
- Rows become a name, a bar and one figure, with the period in words. A
  monthly budget turns amber when the Overview warns about it, and a month
  override is marked.
- Clicking a row opens a sheet with its figures, budget editor and the viewed
  month's transactions, at the side or from the bottom on a phone. The pencil
  and expansion row go.
- Category management moves to a new `/categories` page, linked from the
  Budgets header and the navigation.
- The start month becomes a quiet line at the end of the list.
- Top-level categories with no budget anywhere collapse into "No budget".

Not in this change: a year total in the headline, a full-year transaction
list for yearly rows, and moving yearly history out of the category settings.

## Capabilities

### New Capabilities

- `budget-overview`: the Budgets page's overview, its headline, Needs a look,
  the combined list and the budget sheet.
- `category-settings`: the page where categories are managed.

### Modified Capabilities

- `budgets`: the monthly summary and its yearly line give way to
  `budget-overview`.
- `yearly-budgets`: the "This year" section gives way to `budget-overview`,
  and the start month moves.
- `ui-shell`: Categories joins the navigation.

## Impact

- `backend/budgets/views.py`, `summary.py`: the summary also returns totals,
  pace, attention, group totals and whether a limit is an override.
- `backend/reports/views.py`: attention logic moves to `budgets` so both pages
  share it. The Overview's response doesn't change.
- `frontend/src/pages/BudgetsPage.jsx` is rewritten, and new
  `CategoriesPage.jsx`, `BudgetSheet.jsx` and `lib/budgetOverview.js` are added.
- `BudgetEditor.jsx`, `ProgressBar.jsx`, `SpendingSheet.jsx`, `Layout.jsx` and
  `App.jsx` change. `BudgetsPage.test.jsx` is largely rewritten.
- Links to `/budgets?month=` keep working. No migration.

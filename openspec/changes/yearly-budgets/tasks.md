# Tasks

## 1. Data model

- [x] 1.1 In `budgets/models.py`, add `Category.budget_kind` (`monthly`/`yearly`/`target`, default `monthly`), `YearlyBudget` (`category`, `from_year`, `amount_cents`, nullable `due_month`/`due_day`, unique on category + from_year) and `BudgetSettings` (nullable `start_month`), with one migration and admin registration. Verify that `python manage.py makemigrations --check` is clean and that the existing `budgets` tests pass with every category monthly.

## 2. Yearly figures

- [x] 2.1 Add the pure helpers in `budgets/yearly.py` as in design.md: `budgeted_period`, `prorated_cents`, `target_counts`, `reference_day`, `pace`, `runway_cents`, `tolerance_cents`, `target_state`, and picking a year's `YearlyBudget` values. Verify with `SimpleTestCase` tests for these spec scenarios:
  - "Starting in October", "Starting in June", "Rounded down to the cent" and "Before the start year";
  - "Due after the start" and "Due before the start";
  - "Runway in October", "Pace from the start month" and "Over for the year";
  - "Slightly under", "The tolerance has a floor", and every "Target states" scenario, plus the boundaries: due today, 14 days out, the 7th and 8th day after the due date, and exactly at the tolerance;
  - "Raise next year's budget", "Moving a due date" and "Added mid-year counts the whole year".
- [x] 2.2 Add `yearly_rows(month, today)` (spending since the budgeted period start, `ahead`, `prorated_from`) and `yearly_spent_cents`, and limit `budget_rows` to monthly categories. Verify with `budgets` tests for:
  - "Spending in any month counts" and "A new year starts fresh";
  - "Spending before the start is ignored", "No start month" and "Monthly budgets are unaffected";
  - "Viewing an earlier month of the year", "Viewing a month before the start" and "Running ahead";
  - "Yearly categories are not in the monthly summary";
  - a bounded query count, as in `BudgetSummaryQueryTests`.

## 3. Budgets API

- [x] 3.1 Add `PUT /api/categories/{id}/budget/` (kind, amount, due). It follows the switching rules in design.md and rejects tabs, 29 February, a target without a due date, and a missing yearly amount. Make `PUT .../limit/` reject non-monthly categories. Expose `budget_kind`, the current yearly values, `yearly_history` and `monthly_limits` on the category serializer. Verify with tests for:
  - "New categories are monthly", "Make a category yearly" and "No kind for a tab";
  - "Monthly to yearly", "Yearly to monthly" and "Nothing to drop" (the rows deleted or kept);
  - "Yearly to on a date" and "A due date is required";
  - "No monthly limit on a yearly category", "Set a target" and "Reject 29 February";
  - "A change mid-year covers the whole year", "Two years of history" and "Several changes in one year".
- [x] 3.2 Add `GET/PUT /api/budgets/settings/` for the start month. Add `yearly_spent_cents` and the `yearly` section (with `through`) to `GET /api/budgets/summary/`. Verify with tests for "Viewing October", "Yearly spending line", "Set the start month" (figures change after the PUT) and "Clear the start month".

## 4. Budgets page

- [x] 4.1 Lay the shared pieces down:
  - move `KindSwitch`'s look into `ui/SegmentedControl` and use it for the Budget/Tab switch;
  - add `tone="warning"` to `ProgressBar`;
  - add the client functions to `api/categories.js` and `api/budgets.js`.

  Verify that the existing `BudgetsPage` and `OverviewPage` tests still pass, plus a `ProgressBar` test for the warning tone.
- [ ] 4.2 Reorder the page to Monthly summary, This year, then Categories. Give the monthly table the shared columns (Budget / Left headers, no "Set limit" column) and the "Yearly budgets … this month" footer row. Build `BudgetEditor` as an expansion row opened from the Budget cell, with:
  - the kind segmented control and per-kind fields (day and month for a target);
  - the scope line and the live pro-rating line;
  - the confirmation `Dialog` when switching to or from Monthly would drop amounts;
  - a highlight on a row that moved table.

  Verify with `BudgetsPage.test.jsx` cases for:
  - making a category yearly from the monthly table, and editing it from This year;
  - "Monthly to yearly" and "Yearly to monthly" (dialog text, nothing saved on Cancel) and "Nothing to drop";
  - "Yearly to on a date" (no dialog) and setting a target date;
  - "The editor states the scope";
  - "Yearly spending line".
- [ ] 4.3 Add the "This year (YYYY) · to D Mon" panel:
  - the Budget cell with "of 1,200 · from Oct" when pro-rated;
  - the Status column: bar with pace marker, runway or "over for", warning tone when ahead, and target icon-plus-text states;
  - "Parent / Sub" labels;
  - the start-month button and inline strip with `MonthSwitcher`, Save and Clear;
  - the empty state with "Go to <start month>".

  Add "Monthly · / Yearly · / On a date ·" summaries to Categories rows, with the History disclosure shown only for two or more lines. Verify with tests for:
  - "Viewing October", "Starting in October" (the note), "Runway in October", "Over for the year", "No runway for a past month" and "Running ahead";
  - "Due soon", "Not seen yet", "Overdue", "Partly paid", "Paid over" and "Slightly under" labels;
  - "Viewing a month before the start", "Set the start month" and "Clear the start month";
  - "Two years of history" and "A single line is not a history".
- [ ] 4.4 Below 640px (`useMediaQuery`), render both summaries as stacked rows (name and left; "spent of budget"; status line), with the editor opening below the tapped row and its fields stacked. Verify with a `BudgetsPage` test that mocks a narrow viewport and checks the stacked layout and that the editor opens.

## 5. Overview

- [ ] 5.1 In `OverviewView`, add `budget.yearly_spent_cents` and `attention.yearly`, ordered as in the spec, and leave out targets paid within the tolerance. Verify with `reports/tests_overview.py` cases for:
  - "Yearly spending has its own line";
  - "A yearly budget ahead of pace" and "On pace is not a warning";
  - "Targets that need action", "Not seen yet is listed" and "Paid within tolerance is not listed";
  - "A past month lists no early warnings".
- [ ] 5.2 In `OverviewPage.jsx`:
  - put "€X on yearly budgets" first in the tile's line, with nowrap pieces, and include it in the no-limits total;
  - render the yearly attention items after category warnings, with their second lines and icon colours as in design.md, linking to Budgets on the chosen month.

  Verify with `OverviewPage.test.jsx` cases for "Yearly spending has its own line", "Everything that needs attention" (with "Property tax due in 8 days") and "Nothing to do".

## 6. Check

- [ ] 6.1 In the local stack, set the start month to October 2026 and create:
  - a yearly "Clothing" budget;
  - a "Property tax" target due 1 November;
  - a target paid slightly off its amount;
  - a monthly category.

  Then check:
  - the Budgets page in October, September and a 2027 month;
  - editing from both tables;
  - switching kind (the dialog for monthly, none between the yearly kinds);
  - the history after changing an amount;
  - the overview tile and Needs attention.

  Do this in light and dark mode at full width and at 390px. Verify that backend `python manage.py test` and frontend `npm test`, `npm run lint` and `npm run build` pass.

## Workflow follow-up

- Open a GitHub issue for this change on the Reconciled project (`enhancement`) and reference it in proposal.md.
- Archive the change on its branch, then open the PR with `Fixes #N`.

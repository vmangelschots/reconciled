# Proposal

Issue: #19

## Why

Budgets only know one shape: one limit per category per month. Some
spending doesn't fit a month at all. Clothing has a yearly allowance that
can go at any time, and property tax is one known payment on a known
date. Forcing these into monthly limits makes the month that pays for
them look blown and the others look under. Budgeting also starts mid-year
(October 2026), so a yearly allowance has to count only the part of the
year that's being budgeted.

## What Changes

- **Three budget kinds per category.** A category has exactly one:
  - **Monthly**: as today, a default limit plus per-month overrides.
  - **Yearly**: an amount per calendar year, spent at any time in the
    year. Unspent money carries over to later months of the same year
    but not to the next year.
  - **Yearly on a date** (a target): an amount due on a day and month
    each year, such as property tax of 400.00 on 1 November.
- **Budgeting start month.** One setting, such as October 2026. It only
  affects yearly kinds:
  - Spending before it never counts.
  - In the start year, a yearly budget is pro-rated by the months left,
    the start month included. 1200.00 from October gives 300.00, and from
    June 700.00. The full amount is shown next to it ("of 1,200 · from
    Oct").
  - A target counts in the start year only when its due date falls on or
    after the start.
  - The month a budget is added doesn't matter. A yearly budget always
    covers the whole calendar year.
- **One amount, with history.** A yearly budget has one amount (and a
  due date for a target). Editing it applies to the current year and
  later. Earlier years keep what they had. The category settings show
  that history, read-only, one line per year in which it changed.
- **One budget editor.** It opens from the Budget cell in both the
  monthly and the yearly table, and replaces the per-row limit form. It
  holds the kind (Monthly · Yearly · On a date), the amount, the due date,
  and which years an edit applies to.
  - Switching to or from Monthly deletes the old amounts, after a
    confirmation dialog.
  - Switching between Yearly and On a date keeps the amount and history.
- **Yearly figures on the Budgets page.** A "This year" section shows
  each yearly budget as of the end of the viewed month: budget, spent
  and left.
  - For the current month, yearly budgets also show what's left per
    remaining month and whether spending is ahead of the year's pace.
  - Targets show a state: upcoming, due soon (within 14 days), not seen
    yet (the 7 days after the due date), overdue, partly paid, paid, or
    paid over.
  - A target counts as paid within a tolerance (the larger of 5% and
    10.00), so a bill a little off the estimate doesn't raise a warning.
  - The monthly summary ends with the month's yearly spending, so it
    still adds up.
  - Phone widths get stacked rows instead of wide tables.
- **Overview.**
  - The budget tile stays monthly-only and gains an "on yearly budgets"
    line, so yearly spending no longer shows as spending outside
    budgets.
  - Needs attention lists yearly warnings: a yearly budget that's over,
    or at 85% or more and ahead of the year's pace; a target that's due
    soon, not seen yet, overdue, partly paid or paid over.

Not in scope:
- Envelopes or savings: money set aside in an account, or unspent money
  carried over across years.
- Per-year overrides of a yearly amount, and editing past years.
- Creating or matching transactions from budgets. All spending comes
  from imported transactions in the category.
- Linking targets to the forecast's recurring transactions.
- History for monthly default limits. Changing a default still changes
  past months, as it does today.
- More than one due date a year for a target.
- Checking a target against the last import date ("import to check").
  The existing stale-import reminder covers part of that.

## Capabilities

### New Capabilities
- `yearly-budgets`: yearly and yearly-on-a-date budgets, the budgeting
  start month and pro-rating, amount history, target states, pace and
  runway, and the "This year" section of the Budgets page.

### Modified Capabilities
- `budgets`: a category has one budget kind; monthly limits and the
  monthly summary apply only to monthly categories, with a yearly
  spending line at the end; switching to or from monthly drops the old
  amounts after a confirmation dialog.
- `overview`: the budget tile counts only monthly budgets and shows
  spending from yearly budgets on its own line; Needs attention lists
  yearly warnings and target states.

## Impact

- **Backend (`budgets`, `reports`):**
  - A `budget_kind` on `Category`.
  - A yearly budget model with one row per category and year in which
    the amount or due date changed.
  - A single settings row for the start month.
  - Migrations for all of these.
  - The summary API gains a yearly section, and the overview API a
    yearly spending figure and yearly warnings.
  - `budget_rows` leaves out yearly categories.
- **Frontend:**
  - On `BudgetsPage`: the budget editor, the "This year" section, the
    start month control, and the read-only history. The page is
    reordered to Monthly summary, This year, then Categories.
  - Small shared pieces: a segmented control taken from the existing
    Budget/Tab switch, and a warning tone on `ProgressBar`.
  - On `OverviewPage`: the budget tile line and the new attention items.
- No new dependencies. Existing monthly budgets keep working unchanged:
  every existing category becomes a monthly one.

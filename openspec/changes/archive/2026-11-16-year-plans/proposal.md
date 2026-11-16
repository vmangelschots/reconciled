# Proposal

## Why

The Budgets page answers "how is this month going?", but nothing answers
"does my year add up?". There is no place to see a year's income against
all its budgets (monthly limits times twelve, bills, loans, yearly
budgets), to try out a different budget without touching the real one, or
to correct the budget halfway through the year from a given month on.
Planning the coming year is due now: it is mid-November.

Issue: #77

## What Changes

- The Budgets page gets a **Month | Year** switch. Month is today's page.
  Year shows one calendar year as a **year plan**: income, expenses per
  budget (a monthly budget's twelve months with their exceptions, a Bills
  category's bills, a loan category's installments, yearly and on-a-date
  amounts) and what's left to save. A year switcher goes up to next year.
- Every year has a live **Current budget** plan, read from the real
  budget. It is read-only in the Year view: a year's budget changes only by
  applying a draft from a chosen month. "Change in a new draft" makes that
  one tap. The user can make any number of **drafts** of the current or a
  future year: copies of Current or of another draft, kept apart from the
  real budget.
- A draft can change everything the budget editor can: a category's
  kind, amounts, bills, month exceptions, and giving or removing a
  budget. The same budget sheet opens, clearly marked as editing the
  draft, with **Save to draft**. Loan categories stay locked to their
  schedules. "Add category" creates a real category without a budget.
- **Income** is new and lives in plans only. Each line has a monthly or
  yearly amount plus one-off amounts in given months (holiday pay, a 13th
  month), and may be linked to a category so its actual figure shows. An
  empty Income section suggests lines from the forecast's expected income
  and from the last 12 months' income categories. On Current, income is
  marked as plan only. Nothing tracks income month by month.
- Each row shows **Plan**, **Change** (against Current, in a draft) and **Actual**.
  For a future year, Actual means the last 12 complete months. For the
  current year, Actual means spent so far, and the headline shows where
  the year is heading: spent so far plus the plan for the remaining months.
- A draft has a **from** month: January for a future year, and next month
  by default for the current year. Months before it show the real budget.
  **Apply** shows a preview of what changes in the real budget (amounts,
  kind switches, bills added or ended, month exceptions replaced, what gets
  removed, and rows changed in the real budget since the draft was copied),
  then makes the months from the from month match the draft. Earlier months
  keep their budget, except where a kind switch applies to the whole
  category. That's warned about in the sheet when the kind is switched,
  and first in the preview. The draft's income becomes Current's income for that
  year.
- An applied draft is kept as a read-only record ("Applied 12 Jun, from
  July") under History. Drafts that weren't applied stay editable, and can be
  renamed, duplicated and deleted.
- **The monthly default limit gets a history**, as yearly budgets and
  bills already have. A default can apply from a month on, so applying a
  plan from July leaves January–June's limits as they were. Editing the
  default in the month view changes the default in effect for the viewed
  month.
- Ways in: "Plan the rest of the year" in the month view opens a new
  draft from next month. From 1 November, the month headline offers
  "Plan <next year>".
- Drafts never feed the Forecast, the Overview or warnings. Only the real
  budget does.

Out of scope: editing the real budget from the Year view, a history of
budget kinds, tracking income during the year (budgets for income),
plan-only categories, comparing more than one draft side by side, sharing
or exporting a plan, and a "preview in forecast" for drafts.

## Capabilities

### New Capabilities
- `year-plans`: the Year view of the Budgets page: Current budget and
  drafts for a year, income lines, yearly totals with plan and actual
  figures, editing a draft, applying it from a month, and the history of
  applied drafts.

### Modified Capabilities
- `budgets`: the default monthly limit applies from a month on and keeps
  a history; setting the default changes the one in effect for the given
  month.
- `budget-overview`: the page has a Month | Year switch, and the address
  holds the view. The headline is the month view's, gets a "Plan <next
  year>" nudge from November and a "Plan the rest of the year" link, and
  says no year total is shown in the month view only.
- `data-backup`: a backup holds year plans, their drafts, income lines and
  applied records, and the monthly defaults' history.

## Impact

- Backend: `backend/budgets/models.py` (`CategoryLimit` default gets a
  `from_month`; new plan models), `summary.py` (`monthly_limits` resolves
  the default in effect for the month), `views.py` (`set_limit` writes the
  default in effect), new plan module and API (plans, plan budgets, plan
  bills, income lines, apply preview, apply), `bill_changes.py` reused
  for applying bills, migrations, `backup/format.py`.
- Frontend: `frontend/src/pages/BudgetsPage.jsx` (Month | Year switch),
  new year plan view and components, `BudgetSheet.jsx` /
  `BudgetEditor.jsx` take a draft target, new `frontend/src/api/plans.js`,
  a year switcher next to `ui/MonthSwitcher.jsx`, tests alongside.
- The forecast, Overview and attention panels are unchanged in behaviour:
  they read limits month by month through `monthly_limits`, which now
  picks the default in effect for each month.

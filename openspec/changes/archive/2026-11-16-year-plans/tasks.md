# Tasks

## 1. Default limit history

- [x] 1.1 Add nullable `CategoryLimit.from_month` with the two partial unique constraints for defaults (design 1), plus a migration; verify `python manage.py makemigrations --check` is clean after it and existing `budgets` tests pass
- [x] 1.2 Make `summary.monthly_limits` pick the override, else the default in effect for the month (latest `from_month <= month`, else the null one, else the earliest); verify with tests for "A new default from July", "Before the first default" and "Overrides still win", and that `python manage.py test budgets forecasting` stays green
- [x] 1.3 Let `set_limit` without `month` take `in_effect` (default: today's month) and update the default in effect there; send the viewed month from `BudgetEditor`; verify with tests for "Editing in March" and "Editing in September", the existing "Change the default from an ordinary month" sheet test, and a test that removing the budget or switching kind deletes every default ("Remove after a plan was applied")
- [x] 1.4 Add the default's `from_month` to the backup format; verify with backup tests for "Default history survives" and an old backup without the field restoring as "every month"

## 2. Plan models and the year calculation

- [x] 2.1 Add `YearPlan`, `PlanBudget`, `PlanBill` and `IncomeLine` (design 2), household-scoped, with a migration (the app registers no models in the admin, so neither do these); verify with a model test that one household can't see another's plans
- [x] 2.2 Write `budgets/plans.py`: build the per-category year shape from the real budget (Current) and from a draft over Current (months before the from month, and a kind switch holding for the whole year), with year totals per kind, start-month pro-rating, targets, loans locked, and the cap rule; verify with unit tests for "Monthly with a December exception", "A bill ending in March", "Earlier months stay real", "Caps aren't counted twice", "Left to save", and a parity test that Current's monthly and Bills totals equal the sum of `monthly_limits` over the year
- [x] 2.3 Add income line totals (per month or per year, plus extras) and actuals: the range by year (last 12 complete months, so far, whole year), category spending and income net inflow, "Not in the plan" and uncategorized, and "heading for"; verify with tests for "Salary with holiday pay and a 13th month", "Planning 2027 in November", "An income line without a category", "No budget last year" and "Heading for in June"
- [x] 2.4 Add the diff against Current (`vs current`, struck values) and "changed since copied" from `base`; verify with tests for "Groceries lowered" and "Transport changed meanwhile"

## 3. Plans API

- [x] 3.1 Add the plan list/detail endpoints (chips: Current, drafts by last change, History) and create/rename/from-month/duplicate/delete, with default names ("<year> plan", "Rest of <year>"), a draft copying Current or another draft and storing `base`, "Change in a new draft" (create with a category to open), no drafts of past years, Current's budget rows and applied plans read-only, and moving the from month keeping the draft's values for months it no longer covers; verify with API tests for "New draft from Current", "From Current to a draft", "Delete a draft", "No drafts of a past year", "Correcting in June", "From July to September", "From July to May" and "The record"
- [x] 3.2 Add the draft budget, month exceptions, bills (from month, keeps going or ends) and remove-budget endpoints with the same guards as the category endpoints (tabs, loans, kind rules), "Use <value>" for a row changed since the copy, and Add category from a draft; verify with tests for "Remove a budget in a draft", "A loan in a draft", "December groceries", "Back to the default", "A contract ending in December", "Use the new value", "Car fund" and "A draft doesn't touch the budget" (the summary and forecast unchanged)
- [x] 3.3 Add the income line endpoints for `current` and drafts, plus suggestions (forecast items first, then income categories no item covers) and the no-income and empty-plan flags; verify with tests for "Start from the forecast", "A category the forecast doesn't cover", "Nothing to suggest", "Income on Current is edited directly", "First visit to 2027" and "Nothing yet"
- [x] 3.4 Implement apply as a dry run plus a commit sharing one code path in one transaction (design 5): kind switches listed first with what they remove, defaults from the from month, exceptions replaced, bills from the from month, yearly rows, removals, income moved to Current, the part-spent figure, nothing-to-apply, and stamping the plan; verify with tests for "Previewing Lean", "Cancel", "Nothing to apply", "Applied from July", "An exception replaced", "Next year's draft applied in November", "Monthly to yearly in July", "From this month" and "A failed apply" (nothing changed)
- [x] 3.5 Add year plans to the backup format; verify with backup tests for "Year plans survive" and "A backup from before year plans", then run `python manage.py test`

## 4. Shared editor refactor

- [x] 4.1 Build the draft editor (`PlanBudgetEditor`) and the plan sheet (`PlanSheet`: the editor in a draft, read-only with "Change in a new draft" and "Open in month view" on Current and applied plans) from the month editor's controls, leaving the month view's `BudgetEditor` / `BudgetSheet` unchanged (design 7); verify with the existing `BudgetSheet.test.jsx` passing, plus tests for "Editing in a draft" and "Opening a row in Current"; then run `npm test`, `npm run lint`

## 5. Year view

- [x] 5.1 Add `frontend/src/api/plans.js` for every plan endpoint; verify with cases in a `plans.test.js` for methods and URLs; then run `npm test`
- [x] 5.2 Generalise `MonthSwitcher` into one stepper used for months and years, add the Month | Year `PillSwitch` to `BudgetsPage`'s header, and put `view`/`year`/`plan` in the address; verify with the existing month switcher tests unchanged and page tests for "From October to the year", "A link to the Year view", "Planning next year" and "The address holds the year and plan"
- [x] 5.3 Build `YearPlanView` (design 7): `PlanChip` row with New draft and History; the headline Panel (left to save with share and bar, short of income, Change badge, heading for); the Income panel (plan only on Current, suggestions, Add income line); the expense rows with Plan / Change / Actual (named range header), struck values, the changed dot, So far / Still to come bars, locked loan rows linking to the schedule, and "Not in the plan"; the empty states; verify with component tests for "Current follows the real budget", "Several drafts", "Plan only on Current", "Left to save", "Over income", "First visit to 2027", "Nothing yet", "Groceries lowered", "An unchanged row", "Transport changed meanwhile" and "Planning 2027 in November"
- [x] 5.4 Add the draft surface: the `--draft*` tokens for light and dark, the tinted page, the sticky draft bar (name, From select, Apply), and no bar on Current; in the draft sheet, add the collapsible twelve-month grid (exception marks and reset, earlier months read-only), bill from / until-or-keeps-going, the kind switch warning, and the Add category dialog text; verify with tests for "Current has no draft bar", "Holidays to yearly", "December groceries", "Back to the default", "A contract ending in December" and "Car fund"
- [x] 5.5 Add the Apply dialog (kind switches first, change list, changed-since-copy block, part-spent warning, nothing to apply, error kept in the dialog), the landing on Current with the "Open <Month>" toast, and History with read-only applied plans and Duplicate; verify with tests for "Previewing Lean", "Cancel", "Nothing to apply", "From this month", "Lean applied", "A failed apply" and "The record"; then run `npm test`, `npm run lint`, `npm run build`
- [x] 5.6 Add "Plan the rest of the year" (not in December) and the "Plan <next year>" / "Continue planning <next year> · <draft>" headline offer from 1 November; verify with page tests for "Correcting in June" (month view), "Mid-November", "Already planning" and "Planned"
- [x] 5.7 Lay out the Year view for phones: chips scroll sideways, the draft bar sits above the tab bar, the toast viewport moves up while a draft is open, and rows show Plan plus Change (drafts) or Actual (Current, applied); verify with tests for "A draft on a phone" and "A toast in a draft"

## 6. Review and integration

- [x] 6.1 Have a UI Designer and a UX Architect review the Year view in the running app (`/run-reconciled`, desktop and phone, light and dark), tune the draft tokens if needed, and fold the agreed follow-ups into this task list with `/opsx:update` before doing them


## 7. Review follow-ups

- [x] 7.1 Backend: Apply's from month saved to the draft (PATCH before apply, or apply taking it), and "Change in a draft" opening a category in an existing draft (copying Current's budget for it when the draft holds none); verify with API tests for "Changing the month in the dialog" and "Lean exists"; then run `python manage.py test budgets`
- [x] 7.2 Rows and columns: Current's struck figure on the plan's line and only when it differs, the kind switch ("yearly → monthly") in the caption in the warning colour, the changed dot in the gutter, one-string captions, each row's "so far · still to come" caption in the current year, uppercase column headers, "Heading for €X spent" without income, no doubled headline wording, the share on its own line on a phone; verify with tests for "Groceries lowered", "Same total, other kind", "Heading for without income" and "A row's split"; then run `npm test`
- [x] 7.3 Draft surface: the bar inside the tinted area, the dark tint token, the two-line phone bar with the page padded clear of it, the applied record's bar naming it with History selected and only the panels dimmed, one replaced toast for a draft's saves, "Change in <draft>" / "Change in a new draft" in Current's sheet; verify with tests for "A draft on a phone", "The record", "Lean exists" and a draft's second save replacing the first toast; then run `npm test`, `npm run lint`
- [x] 7.4 Draft editor: months before the from month folded into one real-budget line with kept draft values marked "won't apply", the month grid without spinners, "Sep", stronger exception cells, the default shown solid, a Remove budget button, "Different amount in some months" as a draft-ink link; verify with tests for "From July to September" (the "won't apply" note) and "Back to the default"; then run `npm test`
- [x] 7.5 Dialogs and income: the Apply subtitle ("except where a kind switch below changes them"), space before the change list, the arrow, the from month written to the draft; the income dialog naming its plan and labelling its name field; no stray column on Current's income; the phone press colour inside the panel; verify with tests for "Changing the month in the dialog" and the income dialog's title; then run `npm test`, `npm run lint`, `npm run build`

## 8. Integration check

- [x] 8.1 With `/run-reconciled`, in the demo household: plan 2027 from Current, make a draft that lowers Groceries, switches Holidays to yearly and adds a bill, check vs current and Actual, apply it, and check the month view of December 2026 is unchanged and January 2027 has the new budget; then make a mid-year draft from July for the current year and check that earlier months keep their limits, at desktop and phone width

## Workflow follow-up

- Work on branch `change/year-plans`; commit as `Propose year-plans: ...`, then `Apply year-plans tasks X.Y-X.Z: ...` per group.
- Open a PR with `Fixes #77`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

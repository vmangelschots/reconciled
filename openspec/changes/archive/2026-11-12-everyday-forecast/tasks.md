# Tasks

## 1. Expected items replace recurring transactions

- [x] 1.1 Add the `ExpectedItem` model (name, direction, amount_cents > 0, day 1–31, nullable category and account) with a data migration converting monthly, not-ended `RecurringTransaction`s that have an allowed category, and a follow-up migration deleting `RecurringTransaction`; verify with migration tests: a monthly +4,500 "Salary" in "Salary" starting 25 March becomes an in item of 4,500 on the 25th recognised by "Salary"; a weekly one, an ended one, one without a category and one in a Bills category are dropped; then run `python manage.py test forecasting`
- [x] 1.2 Replace the recurring-transactions API with `/api/expected-items/` (household-scoped) and `/api/expected-items/options/`, rejecting an amount of 0, no or both of category and account, a budgeted or budget-covered category, a loan payment category, a tab, an account in the pot or archived; verify with API tests for each rejection, the options list leaving those out, a create/edit/delete round trip, and the household isolation tests switched to expected items; then run `python manage.py test forecasting households`
- [x] 1.3 Back up and restore expected items with `FORMAT_VERSION` 3 and a 2→3 converter applying the migration's rules; verify with backup tests for "Expected items survive" and "A backup with recurring transactions"; then run `python manage.py test backup`

## 2. The Everyday forecast

- [x] 2.1 Write `forecasting/forecast.py` `everyday_forecast(today, horizon_days)` with the pot, start balance, points, `lowest` and `has_income`, plus the bill, installment and expected-item collectors (current-month states, late → tomorrow, missed → `missed`, recognition within 25% including AI guesses and transfers); verify with tests for the scenarios of "One Everyday forecast", "Bills are forecast on their day", "Loan installments are forecast on their date", "Expected items", "An expected item is recognised", "What already happened this month is not expected again", "A late item is expected tomorrow" and "Income is expected"; then run `python manage.py test forecasting`
- [x] 2.2 Add the budget collectors: monthly limits spread over the month's remaining days (overrides for later months, caps and covered subcategories skipped), yearly budgets spread over the rest of the year, targets on their due date (not seen → tomorrow, overdue/paid skipped), sub-bills subtracted from a covering parent, never below zero, exact cents per month; verify with tests for the scenarios of "Monthly budgets are spread over the month", "Yearly budgets are spread over the year", "Yearly targets are forecast on their due date" and "Bills inside a budgeted parent are not counted twice"; then run `python manage.py test forecasting`
- [x] 2.3 Replace `ForecastView` with `GET /api/forecast/?horizon_days=30|90` (items with source, detail, link and `late_since`, `missed`, and the pot's accounts with their import freshness), add `status`/`received_on`/`next_on` to expected items, and remove `generate_forecast`; verify with API tests (400 on another horizon, links for each source, "received"/"next"/"late"/"budgeted" statuses); then run `python manage.py test forecasting`
- [x] 2.4 Make `reports/views.py` `_projection` use `everyday_forecast(today, 30)` and add `has_income` to the everyday-balance response; verify with report tests for "Two accounts add up" (equal to Forecast over 30 days), "Nothing expected" and "Bills but no salary"; then run `python manage.py test reports`

## 3. Shared pieces

- [x] 3.1 Move the low label, below-zero gradient and point label from `EverydayMoneyChart` into `components/chart/projection.jsx` with `critical` and `dashed` props, and give `Stat` a `size="sm"` with a detail line; verify that the existing `EverydayMoneyChart` and `Stat` tests still pass and add a `Stat` test for the small size with a detail line; then run `npm test`
- [x] 3.2 Let `BudgetsPage` open a category's sheet from `?category=` and drop it from the address on close; verify with `BudgetsPage` tests for "A link opens a category's sheet"; then run `npm test`

## 4. Forecast page

- [x] 4.1 Rewrite `ForecastChart` in Recharts on the shared module: solid line, zero in the axis, Monday ticks at 30 days and month ticks at 90, low label, critical only when `critical`, tooltip with up to 3 items and "+N more"; verify with `ForecastChart` tests for "Hover a payday", "A busy day" and "Running short" with and without `critical`; then run `npm test`
- [x] 4.2 Update `api/forecasting.js` and rewrite `ForecastingPage.jsx`: `PillSwitch` 30/90 in the header synced to `?days=`, the main Panel with three small `Stat`s and their dates, the "what it counts" caption, the stale-import line, the neutral no-income note and the chart, the empty state when nothing is coming up, and the `lg:grid-cols-3` layout with Expected beside it and Coming up below; verify with `ForecastingPage.test.jsx` cases for "Opening Forecast", "A link to 30 days", "A stale account", "Only out items", "A new household" and the critical Lowest figure; then run `npm test`
- [x] 4.3 Build the Coming up panel: day subheaders with whole-euro balances, `ListRow` items with source captions and cent amounts, budget lines, "Not seen" chips with due dates, greyed "Missed · not counted" lines, and navigation for each source; verify with tests for "A day in the list", "Spread budgets", "Where an item is kept", "A late bill" and "A missed bill"; then run `npm test`
- [x] 4.4 Build the Expected panel and the expected item sheet: lines with "Received 24 Nov" / "Next 25 Nov" / late / "Already in a budget", the empty state with "Add expected income" (sheet set to In), In/Out, name, amount, day, the grouped "Recognise by" picker from `options/`, the direction-aware hint, Save/Cancel/Delete; verify with tests for "Salary received", "No expected items yet", "Adding salary" and "Budgeted categories aren't offered", and check the page at 390px wide ("Forecast on a phone"); then run `npm test`, `npm run lint`, `npm run build`

## 5. Overview projection

- [x] 5.1 In `EverydayMoneyChart`, link "Add expected income" to `/forecast?days=30` when there is no projection, and show a muted "No income expected" link with `critical={false}` when `has_income` is false; verify with tests for "Nothing expected", "Bills but no salary" and "Running short" with income; then run `npm test`, `npm run lint`, `npm run build`

## 6. Integration check

- [x] 6.1 Run the app locally with bills, a monthly and a yearly budget, a loan paid from Crelan and no expected items: confirm Forecast shows the empty Expected panel and no critical colour; add "Salary" in 4,500 on the 25th recognised by "Salary" and confirm it shows in the chart, Coming up and the Overview projection, which agrees with Forecast over 30 days; mark a bill paid and see it leave this month; check the budget lines open the right Budgets sheet; check the page at phone width

## Workflow follow-up

- Open a PR from `change/everyday-forecast` with `Fixes #64`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

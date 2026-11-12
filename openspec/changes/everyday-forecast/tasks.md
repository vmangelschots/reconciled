# Tasks

## 1. Expected items replace recurring transactions

- [ ] 1.1 Add the `ExpectedItem` model (name, direction, amount_cents > 0, day 1–31, nullable category and account) with a data migration that converts monthly, not-ended `RecurringTransaction`s (keeping an allowed category only) and a follow-up migration that deletes `RecurringTransaction`; verify with migration tests: a monthly +4,500 "Salary" starting 25 March becomes an in item of 4,500 on the 25th, a weekly one and one ended last month are dropped, a recurring with a Bills category keeps no category; then run `python manage.py test forecasting`
- [ ] 1.2 Replace the recurring-transactions API with `/api/expected-items/` (household-scoped viewset and serializer) rejecting an amount of 0, a Bills or loan payment category, an account in the pot or archived, and both a category and an account; verify with API tests for each rejection and a create/edit/delete round trip, plus the household isolation tests updated from recurring transactions to expected items; then run `python manage.py test forecasting households`
- [ ] 1.3 Back up and restore expected items, bump `FORMAT_VERSION` and convert older backups' recurring transactions as the migration does; verify with backup tests for "Expected items survive" and "A backup with recurring transactions"; then run `python manage.py test backup`

## 2. The Everyday forecast

- [ ] 2.1 Write `forecasting/forecast.py` `everyday_forecast(today, horizon_days)`: the pot from `history_tier`/`tier_balance`, items from bills, loan installments paid from the pot and expected items, the current month's states (paid/posted/received skipped, late moved to tomorrow, missed dropped, expected items only within their month), daily points, `lowest` and `has_income`; verify with tests for every `forecasting` scenario (two accounts in one pot, transfer between them, Streaming next month, ended bill, rent on the 31st, mortgage once each, loan paid from savings, salary early/late/never arrived, savings by transfer, item without recognition, Netflix paid, paid before its day, Disney+ not seen, due today, missed bill); then run `python manage.py test forecasting`
- [ ] 2.2 Replace `ForecastView` with `GET /api/forecast/?horizon_days=30|90` returning the forecast with each item's source, link and `late_since`, add each expected item's month status (`received_on`, `expected_on`, `late`) to the expected-items API, and remove `generate_forecast`; verify with API tests (400 on another horizon, item links for a bill, an installment and an expected item, "Received 24 Nov" status); then run `python manage.py test forecasting`
- [ ] 2.3 Make `reports/views.py` `_projection` use `everyday_forecast(today, 30)` and add `has_income` to the everyday-balance response; verify with report tests for "Two accounts add up" (same as Forecast over 30 days), "Nothing expected" (no projection) and "Bills but no salary" (`has_income` false); then run `python manage.py test reports`

## 3. Forecast page

- [ ] 3.1 Move `ProjectionStroke`, `PointLabel` and the low-label logic from `EverydayMoneyChart` into a shared chart module with a `critical` switch, and rewrite `ForecastChart` in Recharts on it (stepped line from today, zero in the axis, low label, critical below zero only when `critical`, tooltip with the day's items); verify with `ForecastChart` tests (hover a payday shows "Tue 25 Nov" and "Salary +€4,500", running short is critical, no critical colour with `critical={false}`) and the existing `EverydayMoneyChart` tests still passing; then run `npm test`
- [ ] 3.2 Update `api/forecasting.js` and rewrite `ForecastingPage.jsx`: no account choice, 30/90 `SegmentedControl` (90 at first), three `Stat`s (Today, Lowest with date, In N days), the "No income expected" note with "Add expected income", the chart and "Coming up" grouped by day with balances, sources, late captions in the warning colour and navigation to Budgets, the loan schedule or the item's sheet, and "Nothing expected in the next 90 days"; verify with `ForecastingPage.test.jsx` cases for each "The Forecast page", "Coming up" and "Forecast without expected income" scenario; then run `npm test`
- [ ] 3.3 Add the Expected list and the expected item `Sheet` (In/Out, name, amount, day, "Recognise by" offering only allowed categories then allowed accounts, the recognition hint, Save/Cancel/Delete), with month statuses "Received 24 Nov" / "Expected 25 Nov" / late; verify with tests for "Salary received", "Adding salary" and "Bills categories aren't offered", and check the page at 390px wide (no sideways scroll, figures in one row, bottom sheet); then run `npm test`, `npm run lint`, `npm run build`

## 4. Overview projection

- [ ] 4.1 In `EverydayMoneyChart`, replace "Set up recurring transactions" with "Add expected income" when there is no projection, and show "No income expected" linking to Forecast with `critical={false}` when `has_income` is false; verify with `EverydayMoneyChart` tests for "Nothing expected", "Bills but no salary" and "Running short" with income; then run `npm test`, `npm run lint`, `npm run build`

## 5. Integration check

- [ ] 5.1 Run the app locally with bills, a loan paid from Crelan and no expected items: confirm Forecast shows the no-income note without the critical colour; add "Salary" in 4,500 on the 25th recognised by "Salary" and confirm it appears in the chart, Coming up and the Overview projection, which agree over 30 days; mark a bill paid and confirm it leaves this month's items; check the page on a phone width

## Workflow follow-up

- Open a PR from `change/everyday-forecast` with `Fixes #64`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

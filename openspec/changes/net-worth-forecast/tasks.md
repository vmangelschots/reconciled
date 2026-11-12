# Tasks

## 1. Backend

- [ ] 1.1 Give `_installment_items` a `tier=None` (every active loan) and `interest=True` (minus the interest) mode and `_expected_items` a `transfers=False` mode, keeping the Everyday behaviour unchanged; verify the existing `forecasting` tests still pass and add tests that every active loan's interest is taken in interest mode and that account-recognised items are skipped without transfers; then run `python manage.py test forecasting`
- [ ] 1.2 Write `net_worth_forecast(today, months)` (start from `net_worth_at`, month totals including spread budgets per day, `empty`, `has_income`) and `GET /api/forecast/net-worth/?years=1|3|5`; verify with tests for "Three years ahead", "A bill already paid", "Saving every month", "Salary and bills", "The house", "The mortgage" (interest only, paid from savings too), "A loan paid off", and a 400 for another `years`; then run `python manage.py test forecasting`
- [ ] 1.3 Add `projection` to `NetWorthView` from `net_worth_forecast(today, 12)` (the months after the current one, or null when empty); verify with report tests for "A year ahead" (December through November, equal to the Forecast API's months) and "Nothing forecast"; then run `python manage.py test reports`

## 2. Forecast page

- [ ] 2.1 Add `getNetWorthForecast(years)` and a `NetWorthForecastChart` (monthly solid line, zero when in range, normal colours, month ticks over 1 year and Januaries over 3–5, tooltip with month, net worth and change); verify with component tests for "Hover a month" and "Negative net worth"; then run `npm test`
- [ ] 2.2 Add the Everyday | Net worth switch and the 1/3/5 years switch to `ForecastingPage`, synced to `?view=net-worth&years=`, with the net worth summary (Today, Change, In N years, caption, stale-import line for all accounts, no-income note, chart or "Nothing expected in the next N years") and no Coming up; verify with page tests for "Switching to net worth", "A link to five years", "One year" and "Nothing in net worth either", and the existing Everyday tests unchanged; then run `npm test`, `npm run lint`, `npm run build`

## 3. Overview net worth chart

- [ ] 3.1 Give `NetWorthChart` a `projection`: history sliced by range, then a dashed line joined at the current month, and a "Projected" tooltip with total and change only; pass it from the Overview; verify with tests for "History and a year ahead", "The 1Y range" and "Hover a projected month", and the existing net worth chart tests; then run `npm test`, `npm run lint`, `npm run build`

## 4. Integration check

- [ ] 4.1 With `/run-reconciled`, seed the demo household, add a salary and a transfer to savings, and confirm in the running app: the Net worth view over 1/3/5 years with interest-only loan steps and no change from the transfer, the Overview's dashed 12-month projection matching the Forecast page's first year, and the page at phone width

## Workflow follow-up

- Open a PR from `change/net-worth-forecast` with `Fixes #71`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

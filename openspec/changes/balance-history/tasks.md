# Tasks

## 1. Forecast corrections

- [x] 1.1 In `forecasting/utils.py`, expand occurrences from tomorrow and
  update the tests in `forecasting/tests.py` that assume today counts.
  Verify with a test for "An occurrence due today is left out".
- [x] 1.2 Add loan installments to the paying account's forecast, skipping
  those covered by a recurring transaction. Verify with tests for
  "Installment on the paying account" and "A recurring transaction already
  covers it", plus one matching on `payment_category`.

## 2. Balance history backend

- [ ] 2.1 Add `reports/balances.py` with per-account, per-day accumulation
  and tier totals. Verify in `reports/tests_balances.py` with "A value
  adjustment moves the balance", "A split counts once" and "A closed
  savings account".
- [ ] 2.2 Add the net worth endpoint. Verify with tests for "Tiers add
  up", "A purchase with a loan is neutral" and "An asset shows when its
  value is first set", and that the current month reports today's balance.
- [ ] 2.3 Add the everyday balance endpoint with its projection. Verify
  with tests for "Current month", "Past month", "Short history", "Two
  accounts add up", "Past month has no projection", and rejecting a
  malformed month.
- [ ] 2.4 Add `net_worth_change_cents` to the overview response. Verify in
  `reports/tests_overview.py` for a rise, a past month, and null without an
  earlier month end.

## 3. Chart components

- [ ] 3.1 Add `--chart-area` to both themes, and extract `ChartViewSwitch`
  to `components/ui/` with a text variant and the tooltip chrome from
  `InOutTooltip`. Verify `InOutChart.test.jsx` and `OverviewPage.test.jsx`
  still pass.
- [ ] 3.2 Add the `getEverydayBalance` and `getNetWorth` API functions and
  the `EverydayMoneyChart` component with its table, projection, lowest
  label, Today marker and no-history states. Verify in
  `EverydayMoneyChart.test.jsx` with "Hover a day", "Table view", "Past
  month", "One tier that isn't Everyday", "Today is an actual", "A low
  ahead", "Only rising", "Running short", "Nothing scheduled", "Stale
  account", "Several stale accounts", "No projection", "Under three days of
  everyday history" and "No everyday history".
- [ ] 3.3 Add the `NetWorthChart` component with its side-column sizing,
  ranges, tooltip, chosen-month marker and no-history state, first
  confirming in the running app that the tooltip can open over the main
  column. Verify in
  `NetWorthChart.test.jsx` with "Eighteen months of history", "One year of
  history or less", "Hover October" and "No earlier month end".

## 4. Overview

- [ ] 4.1 Place both charts in `OverviewPage.jsx`, mounting net worth in
  the side column or main column by screen width, each loading and failing
  on its own. Verify in `OverviewPage.test.jsx` with "No tabs, no gap" and
  a failing chart that leaves the others intact.
- [ ] 4.2 Show the net worth change in the Balance tile. Verify in
  `OverviewPage.test.jsx` with "A rise this month", "A past month" and
  "First month".

## 5. Checks

- [ ] 5.1 Run `npm test`, `npm run lint` and `npm run build` in
  `frontend/`, and `python manage.py test` in `backend/`, and verify all
  pass.
- [ ] 5.2 Open the Overview in the running app, in light and dark, wide
  and 390px, and verify the phone order, the join between history and
  projection, and that nothing scrolls sideways.

## Workflow follow-up

- Archive the change on its branch before merging, and before
  `spending-report` is applied.

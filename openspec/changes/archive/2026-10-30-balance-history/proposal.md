# Proposal

## Why

The Overview shows today's balances but not how they got there or where
they are heading: there is no way to see whether everyday money runs
short before payday, or whether net worth is growing. Every figure needed
already sits in the ledger, the value adjustments and the recurring
transactions.

## What Changes

- Add an "Everyday money" line chart to the Overview: the daily balance
  over about 90 days, ending at the chosen month's end or today, following
  the month switcher.
- Continue that line with a dashed 30-day projection from recurring
  transactions and loan installments, labelled with its lowest point.
- Add a "Net worth" line chart to the Overview: month-end values over all
  history with 1Y / 5Y / All ranges and a per-tier breakdown on hover. It
  shows real jumps; a valued account's history is what its ledger says.
- Show the chosen month's net worth change under the Net worth figure in
  the Balance tile.
- Count archived accounts in both histories, so archiving an account
  doesn't rewrite the past.
- Change forecasting so occurrences start tomorrow, and so a loan's
  installments leave its paying account. **BREAKING** for the Forecast
  page's figures: an occurrence due today no longer counts, and a paying
  account now shows its installments.

## Capabilities

### New Capabilities

- `balance-history`: Past balances of the Everyday tier and of net worth,
  derived from the ledger, the projection added to them, and how the two
  charts show them.

### Modified Capabilities

- `overview`: The layout and phone order gain the two charts, and the
  Balance tile gains the net worth change.
- `forecasting`: Occurrences start the day after today, and loan
  installments are projected on the paying account.

## Impact

- Backend: new report endpoints in `backend/reports/`, a balance-series
  helper, `net_worth_change_cents` on the overview response, and changes
  to `backend/forecasting/utils.py`.
- Frontend: two new chart components, `OverviewPage.jsx` layout and
  Balance tile, new token `--chart-area`, a text variant of the chart view
  switch extracted into `components/ui/`.
- No new dependency and no migration.
- `spending-report` builds on this change's Overview layout, so this one
  is applied and archived first.

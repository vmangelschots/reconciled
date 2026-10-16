# Proposal

## Why

All amounts in the app are shown in US dollars ("$1,234.56", "$1.5K"
on chart axes), but the user's money is in euro. The amounts themselves
are already currency-less cents; only their display is wrong.

## What Changes

- Every amount in the app is shown in euro: the ledger, accounts,
  budgets, forecast, import preview, dashboard charts and their tooltips
  and tables.
- Chart axis labels use the euro sign in their short form ("€1.5K").
- The eight copies of the money formatter are replaced by one shared
  helper, so the currency is set in a single place.
- Number formatting (thousands and decimal separators) keeps following
  the browser's language settings, as it does today. Only the currency
  changes.

Not in scope: multiple currencies, a currency setting, and parsing
decimal commas in typed amounts or CSV imports. Those are unchanged.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `ui-shell`: amounts are displayed in euro throughout the app.

## Impact

- New `frontend/src/lib/money.js` (`formatMoney`, `formatMoneyCompact`)
  with tests.
- `AccountsPage`, `BudgetsPage`, `ForecastingPage`, `ImportPage`,
  `TransactionsPage`, `ForecastChart`, `InOutChart` and
  `CategorySpendingChart` use the shared helper instead of their local
  formatters.
- Tests that assert "$" amounts are updated to "€".
- No backend, API or data change.

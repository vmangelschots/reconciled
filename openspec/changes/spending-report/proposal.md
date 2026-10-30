# Proposal

## Why

The app answers "what did I spend this month?", but not "where does my
money go over a year?". There is no way to compare categories across
months, see totals and monthly averages, or see how much of the income is
being saved. The Overview is also getting long, so the longer-term In vs
out chart belongs with these figures.

## What Changes

- Add a Reports page with a period picker: 12 months (the default, the
  last 12 complete months), This year, Last year, or a custom range of up
  to 24 months.
- Show spending per month per category as stacked bars: the top 6
  categories plus Other and Uncategorized.
- Show the same figures as a table: categories by months, parents
  expanding into subcategories, with Total and Avg columns and a Total row.
- Add Income, Net and Savings rate rows below the table, and a one-line
  summary of the period under the title.
- Open the transactions behind any table cell or chart segment in a sheet,
  where a transaction's category can be changed on the spot.
- Move In vs out from the Overview to Reports. **BREAKING**: the Overview
  no longer shows it, and its period follows the report instead of 12
  months ending at the Overview's month.
- Count archived accounts in the report, so past months stay complete.
- Warn on the page when more than 10% of the period's spending is
  uncategorized.

## Capabilities

### New Capabilities

- `spending-report`: The Reports page: its period, its monthly figures per
  category, the chart, the table, the summary rows and the drill-down into
  transactions.

### Modified Capabilities

- `dashboard`: In vs out moves to Reports, follows the report's period and
  counts archived accounts.
- `overview`: The layout and phone order lose In vs out.
- `ui-shell`: Navigation gains Reports.
- `transactions`: A link can open a ledger filtered to a date range.

## Impact

- Backend: new report and drill-down endpoints in `backend/reports/`;
  `active_transactions()` gains a way to include archived accounts;
  `CashFlowView` and its route are removed.
- Frontend: new `ReportsPage` with its route and nav item, new chart,
  table and sheet components, `getCashFlow` removed, `HatchPattern`
  extracted from `CategorySpendingPie.jsx`.
- `TransactionsPage.jsx` reads its date filters from the address; the API
  already filters by date.
- No new dependency and no migration.
- Depends on `balance-history`, whose Overview layout this change edits:
  apply and archive that one first.

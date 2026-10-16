# Proposal

## Why

The dashboard is a welcome card that points to the other pages. With
transactions and categories in place, it can answer the two questions you
open a budget app with: am I spending more than I earn, and where does the
money go?

## What Changes

- The dashboard shows two charts in place of the welcome card.
- **In vs out**: one pair of bars per month for the last 12 months,
  including the current one. Money in is the total of positive
  transactions, money out the total of negative ones (shown as a positive
  height), across all non-archived accounts. Months with no transactions
  show as zero, not as gaps.
- **Expenses per category**: horizontal bars for one month (the current
  one by default, with previous/next navigation), sorted largest first.
  Subcategories are rolled into their parent, and a parent can be expanded
  to show its subcategories. Spending without a category is shown as an
  "Uncategorized" bar.
- Both charts have hover tooltips and a table view, and both work in
  light and dark themes.
- New read-only API endpoints provide the monthly in/out totals and the
  per-category spending for a month, counting non-archived accounts only.

**Known limitation (not in scope):** the app has no concept of a transfer
yet, so moving money between your own accounts counts as both in and out.

Not in scope: picking accounts or date ranges beyond the month navigation,
budget-limit overlays, stat tiles, and changes to the Budgets page's
existing summary.

## Capabilities

### New Capabilities
- `dashboard`: the overview page and the figures it shows, meaning what
  counts as money in, money out and category spending, over which
  accounts and periods.

### Modified Capabilities
<!-- none -->

## Impact

- Backend: a new `reports` Django app with two read-only DRF views, wired
  into `config/urls.py`, plus tests. No model changes or migrations.
- Frontend: `frontend/src/api/reports.js`, a rewrite of `DashboardPage.jsx`,
  an `InOutChart` built on Recharts and a `CategorySpendingChart` built
  from plain HTML rows, a `--chart-series-2` colour token for both themes
  in `index.css`, and tests.
- New frontend dependency: `recharts` (v3, which supports React 19), plus
  its `react-is` peer. It becomes the charting library for future charts.
  `ForecastChart.jsx` stays hand-rolled for now and moves to it in a later
  change.

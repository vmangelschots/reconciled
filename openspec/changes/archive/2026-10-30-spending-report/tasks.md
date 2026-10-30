# Tasks

## 1. Report backend

- [x] 1.1 Generalise `active_transactions()` in `reports/spending.py` so
  it can include archived accounts, leaving Overview results unchanged.
  Verify with `reports/tests_overview.py` passing unchanged.
- [x] 1.2 Add the spending report endpoint: period checks, clipping to the
  data, per-month category figures, rollups and in/out. Verify in
  `reports/tests_spending.py` with "Too long", "Data starts in March",
  "Spending on a closed card", "Refund bigger than spending", "Salary",
  "Refunds beat spending over the period", "Both directions" and a split.
- [x] 1.3 Add full months, Avg inputs, Net, Income and Savings rate to the
  response. Verify with tests for "Current month is left out", "Too little
  data" and "A month's figures".
- [x] 1.4 Add the drill-down endpoint on the same queryset. Verify with
  tests for "A parent's cell", "A part of a split", Uncategorized, `direct`,
  and that the rows sum to the matching report figure.
- [x] 1.5 Remove `CashFlowView` and its route, moving its tests onto the
  new endpoint with the `dashboard` scenarios, including "Archived
  accounts count". Verify `python manage.py test reports` passes.

## 2. Reports page

- [x] 2.1 Add `lib/reportPeriod.js`, the route, the sidebar and More item,
  and a `ReportsPage` with its header, period picker and caption. Verify
  in `reportPeriod.test.js` and `ReportsPage.test.jsx` with "Default
  period" and "Reload keeps the period", and in `Layout.test.jsx` with
  "Narrow viewport collapses navigation".
- [x] 2.2 Add `SpendingTable` with its Income and Expenses sections,
  expanding parents, Total, Avg, section totals, Net and Savings rate. Verify
  in `SpendingTable.test.jsx` with "Totals add up", "Both sections", "Expand
  a parent", zero and negative cells, and the "so
  far" month, using the compact styling and the end scroll from the design.
- [x] 2.3 Extract `HatchPattern` and add `SpendingChart` with its stable
  colours, negative segments, legend isolation and the link to table
  hover. Verify in `SpendingChart.test.jsx` with "Nine categories", "Hover
  a month", "Isolate Groceries" and "Hover a row without a segment".
- [x] 2.4 Add the Spending / In vs out switch and the summary line, reusing
  `InOutChart`. Verify in `ReportsPage.test.jsx` with "Summary line" and
  "Follows the report's period".
- [x] 2.5 Add the uncategorized warning and the empty, thin-data, loading
  and error states. Verify in `ReportsPage.test.jsx` with "Large
  uncategorized share", "No accounts", "No transactions", "First weeks",
  "An empty chosen period", "A bad URL" and "Change period".

## 3. Transactions sheet

- [x] 3.1 Add `SpendingSheet`, opened from table cells and chart segments.
  Verify in `SpendingSheet.test.jsx` with "A parent's cell", "An income
  cell", "A part of a split", "Other in the chart", "Cells that open nothing", "Touch on the
  chart" and "Sheet loading and errors".
- [x] 3.2 Add inline recategorising, the background refresh with the
  Review count, and the Review link. Verify in `SpendingSheet.test.jsx`
  with "Recategorise a row", "A move within the parent", "A failed save",
  "The last row leaves" and "Uncategorized".
- [x] 3.3 Seed `TransactionsPage` filters from the address and link the
  sheet's rows to it. Verify in `TransactionsPage.test.jsx` with "Opened on
  a month" and "Malformed dates", and in `SpendingSheet.test.jsx` with
  "Fixing a split".

## 4. Overview

- [x] 4.1 Remove In vs out from `OverviewPage.jsx` and drop `getCashFlow`.
  Verify in `OverviewPage.test.jsx` that the panel is gone, with "One chart
  fails, the other still shows".

## 5. Checks

- [x] 5.1 Run `npm test`, `npm run lint` and `npm run build` in
  `frontend/`, and `python manage.py test` in `backend/`, and verify all
  pass.
- [x] 5.2 Open Reports in the running app, in light and dark, wide and
  390px, and verify "Phone table", the sheet on both sizes, and that a
  recategorised row updates the table.

## Workflow follow-up

- Apply after `balance-history` is archived, since this change edits its
  Overview layout.
- Archive the change on its branch before merging.

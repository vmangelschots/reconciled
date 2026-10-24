# Tasks

## 1. Overview endpoint

- [x] 1.1 Extract `budgets.summary.budget_rows(month)` (no tabs, with limits and spending in grouped queries rather than N+1) and `reports.spending.month_spending(month)` out of `BudgetSummaryView` and `CategorySpendingView`, and make both views use them. Verify that the existing budgets and reports tests pass unchanged, and add an `assertNumQueries` bound on the budget summary.
- [x] 1.2 Add `GET /api/reports/overview/?month=&account=` (`OverviewView`) with the account (including `last_import_date`), month, budget (spent in budgeted categories, outside, uncategorized, pace, days left), attention, forecast and recent fields as in design.md. Verify with `reports/tests_overview.py` (today frozen at 24 October 2026):
  - **Balance:** the balance and the month's change, without transfers or tabs.
  - **Budget:**
    - "Under budget mid-month" figures, including outside and uncategorized spending and a pace of 24/31 with 8 days left;
    - "Unbudgeted spending doesn't make the budget over";
    - no pace or days for September;
    - `has_limits` false.
  - **Attention:** categories over their limit sorted by euros over; the current month's 85%+ ahead of pace sorted by share; "On pace is not a warning" (29 October); "A past month lists only what went over"; floor rounding.
  - **Counts and import:** review and uncategorized counts, and `last_import_date` from the latest committed import (null when there is none).
  - **Forecast:** the low point and the next recurring transaction, and `has_recurring` false.
  - **Recent:** the last 8 ledger rows, with a split transaction listed once.
  - **Errors:** 400 for "2026-13" and for a missing month, 404 for an unknown account.

## 2. Visual foundation

- [x] 2.1 Lay the visual base:
  - add `@fontsource-variable/inter`, set `--font-sans` in `@theme`, add the `num` utility, and add `viewport-fit=cover` to `index.html`;
  - set the token values from design.md (light and dark), with `--surface-2`, `--positive` and `--on-accent` added to `@theme`, `--success` aliased to positive, and the chart series tokens changed;
  - point `InOutChart` at the positive and neutral series;
  - replace every hard-coded `text-white` on the accent with `text-on-accent`: Button, Select, Layout, Budgets toggle, Import file button;
  - move outline/ghost button, table row, tab row and picker hovers to `bg-surface-2`;
  - restyle `Card`/`CardHeader`/`CardContent` (`p-5`, ring), `Input`, `Table` (header style, `h-11` rows) and `Select`.

  Verify that the frontend suite and build pass, that `grep` finds no `text-white` left on accent backgrounds, and that the built CSS bundles the Inter font file with no external font URL.
- [x] 2.2 Add `PageHeader`, `Panel` (actions, flush, loading, error), `Stat`, `ProgressBar` (marker), `MonthSwitcher` (short), `Amount` (signDisplay), `ListRow`, `EmptyState` and `Skeleton` to `components/ui`, `lib/months.js` (the month helpers, local time), and `formatMoneyWhole` in `lib/money.js`. Verify with unit tests:
  - `MonthSwitcher` disables next on the current month, and uses local time at 1 Nov 00:30 local while UTC is 31 Oct;
  - `Amount` shows "+" with the positive tone only when signed, including with the nl-BE locale;
  - `formatMoneyWhole` gives "€3,482" for 348217;
  - `ProgressBar` is capped at 100%, turns critical when over, and draws the marker;
  - `Panel` shows its loading and error states.
- [x] 2.3 Add `OverviewAccountProvider`, which keeps the chosen account in `localStorage` (wrapped in try/catch) and falls back to the first active account when the stored one is missing or archived. Rewrite `Layout`:
  - a sidebar at `lg` with the wordmark, two groups, the review count, and a footer with the account balance and theme and sign-out icons;
  - below `lg`, a centred bottom tab bar with Overview, Transactions, Review, Budgets and More, where More opens a sheet;
  - "Dashboard" renamed "Overview";
  - content padding for the bar, and the toast lifted above it.

  Verify with `Layout.test.jsx` cases for "Wide viewport shows navigation inline", "Narrow viewport collapses navigation", "Tablet width keeps the tab bar compact" (a centred max-width row), "The current page is marked", the review count in both, and the remembered account with its fallback.

## 3. Overview page

- [ ] 3.1 Add `api/overview.js` and `OverviewPage` at `/`, replacing `DashboardPage`:
  - a header with `MonthSwitcher`, the account picker (more than one account) and Import;
  - the balance, budget (with pace) and forecast tiles, including the "Today" / "From today" notes for past months;
  - needs attention as `ListRow`s with the links from design.md, including the stale import worked out in local time;
  - `OpenTabsCard` in its compact form;
  - recent transactions as `ListRow`s;
  - the category and in vs out charts following the month, with "Show as table" as panel actions.

  Each panel loads and fails on its own. Verify with `OverviewPage.test.jsx` covering every overview scenario:
  - account and month: "Opens on this month", "The chosen account is remembered", "A remembered account that is gone", "One account, no picker", "No accounts yet", "Import from the overview";
  - balance and budget: both balance scenarios, all budget tile and pace scenarios;
  - needs attention: "Everything that needs attention", "Category items open the right month", "Nothing to do", both stale import scenarios;
  - forecast and recent: all three forecast scenarios and "Last eight";
  - charts: "Follows the overview's month" and "Move to the previous month";
  - layout: the tabs panel scenarios and "One panel fails".

  Move the useful `DashboardPage.test.jsx` cases over and delete the old page.
- [ ] 3.2 Lay the overview out with `grid-template-areas` at `lg` and the phone order as DOM order. On a phone, the tiles are compact and "all in order" is a single line. Verify in the browser at 1440px, 1024px, 800px and 390px:
  - the order matches the spec;
  - "No tabs, no gap" holds;
  - nothing scrolls sideways;
  - the last panel and the notifications aren't hidden behind the tab bar.

## 4. Restyle the other pages

- [ ] 4.1 Move Transactions (including `SplitEditor` and the inline form, which stays inline) and Review onto `PageHeader`, `Panel` (flush tables), signed right-aligned `Amount`, short dates and `EmptyState`, without moving any section. Verify that their test suites pass (only label and heading queries change), and check both pages in the browser in light and dark mode.
- [ ] 4.2 Do the same for:
  - **Budgets:** `MonthSwitcher`, plus the month in `?month=` read with `useSearchParams` in local time;
  - **Forecast:** `Amount` right-aligned, and short dates in the occurrences table;
  - **Import;**
  - **Accounts:** balances with `Amount`, and "Add account" in the header;
  - **the tab page.**

  Verify that their test suites pass, add Budgets tests for "A link opens the right month", "Switching updates the address" and "Local time decides the current month", and check each page in the browser at desktop width and at 390px.
- [ ] 4.3 Run the whole flow in the local stack in both themes:
  - navigate everything from the sidebar and from the tab bar's More sheet;
  - switch the overview's month and account;
  - follow each needs-attention link;
  - trigger a notification on a phone width.

  Verify that frontend `npm test`, `npm run lint` and `npm run build` pass, and that backend `python manage.py test` passes.

## Workflow follow-up

- Open a GitHub issue for this change on the Reconciled project and reference it in proposal.md.
- Archive the change on its branch, then open the PR with `Fixes #N`.
- Propose the follow-up flow change: Transactions toolbar and sheet, Budgets status view and "Manage categories", Forecast chart first (and readable on a phone), the import hand-off, and a less dense Review page.

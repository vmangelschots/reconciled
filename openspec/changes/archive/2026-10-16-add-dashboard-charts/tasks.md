# Tasks

## 1. Reports API

- [x] 1.1 Create the `reports` Django app (no models), add it to `INSTALLED_APPS`, and include `reports.urls` under `api/` in `config/urls.py`. Verify that `docker compose exec backend python manage.py check` passes.
- [x] 1.2 Implement `GET /api/reports/cash-flow/?end=YYYY-MM` (12 zero-filled months, active accounts only, in/out summed separately, 400 on a missing or bad `end`). Verify with `reports/tests.py` cases covering the spec's in/out totals, the archived-account exclusion, an empty month, and the 400 response, all passing under `docker compose exec backend python manage.py test reports`.
- [x] 1.3 Implement `GET /api/reports/category-spending/?month=YYYY-MM` (net outflow per category over active accounts, parent roll-up with `direct_cents` and `subcategories`, non-positive rows omitted, sorted descending, outflow-only `uncategorized_cents`, 400 on a bad month). Verify with tests for the roll-up, refund, uncategorized-ignores-income, archived-account and ordering scenarios, all passing under `python manage.py test reports`.

## 2. Chart components

- [x] 2.0 Add `recharts` (^3) and its `react-is` peer to the frontend dependencies. Verify that `npm install` succeeds with no peer-dependency warnings for React 19 and that `npm run build` still passes, noting the bundle-size change.
- [x] 2.1 Add `frontend/src/api/reports.js` (`getCashFlow(end)`, `getCategorySpending(month)`) and the `--chart-series-2` token (`#eb6834` light / `#d95926` dark, both theme blocks) with its chart classes in `index.css`. Verify that the app builds (`npm run build`) and the token resolves in both themes.
- [x] 2.2 Build `InOutChart` on Recharts (`BarChart` with two `Bar`s coloured from `--chart-series-1`/`-2`, zero-based `YAxis`, custom `Legend` and `Tooltip` content showing in, out and difference, animation off, `ResponsiveContainer` unless a `width` prop is given, "Show table" toggle, `role="img"` summary). Verify with `InOutChart.test.jsx` (rendered with a fixed `width`): it renders bars for all 12 months, the legend names both series, hovering a month's bar shows its three figures, and the table lists every month.
- [x] 2.3 Build `CategorySpendingChart` (HTML bar rows, largest first, direct name + amount labels, expandable parents with `aria-expanded` showing subcategories plus "<Parent> (direct)", Uncategorized row, empty-month message, "Show table" toggle). Verify with `CategorySpendingChart.test.jsx`: the order, expand/collapse, the direct row appearing only when non-zero, no expand control without subcategories, and the empty state.

## 3. Dashboard page

- [x] 3.1 Rewrite `DashboardPage.jsx` to load both endpoints independently from the browser's local current month, with per-card loading and error states (`toast.error` plus an inline message), and previous/next month navigation for the expenses chart, capped at the current month. Verify with `DashboardPage.test.jsx`: both charts render from mocked APIs; "previous month" refetches with the prior month and enables "next"; "next" is disabled on the current month; a failing category request leaves the in/out chart visible and shows the error.

## 4. Integration check

- [x] 4.1 Run the full frontend suite and lint plus `python manage.py test`, rebuild the backend and frontend containers, then open the dashboard in the browser in light and dark themes. Verify that both charts show real data, hover and table views work, expanding a parent works, month navigation works, and labels don't collide (screenshot check).

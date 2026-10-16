# Design

## Context

`DashboardPage.jsx` is a static welcome card. The only existing chart,
`ForecastChart.jsx`, is hand-rolled SVG: fixed `viewBox`, a hover index,
a "show table" toggle, and CSS classes in `index.css` (`chart-line`, etc.)
coloured from `--chart-series-1`, `--chart-gridline` and `--chart-baseline`,
with dark-mode values. `BudgetSummaryView` totals spending per category for
one month, but it covers archived accounts, treats uncategorized income as
negative spending, and returns a flat list, so it doesn't fit the dashboard
spec (see `specs/dashboard`). Month helpers `parse_month` / `month_range`
live in `budgets/utils.py`. Server `TIME_ZONE` is UTC.

## Goals / Non-Goals

**Goals:**
- Aggregate in the database (one grouped query per endpoint), not per
  category in Python like `BudgetSummaryView`.
- Introduce Recharts as the app's charting library, themed from the
  existing `--chart-*` CSS tokens, so future charts are configuration
  rather than hand-built axes and tooltips.

**Non-Goals:**
- Migrating `ForecastChart` to Recharts. That's a later change.
- Using Recharts for the expenses chart (see below).
- Changing `BudgetSummaryView` or the Budgets page.

## Decisions

### A `reports` app with two read-only endpoints
- `GET /api/reports/cash-flow/?end=YYYY-MM` returns
  `{"months": [{"month": "YYYY-MM", "in_cents": int, "out_cents": int}, …]}`.
  It has 12 entries, oldest first, ending at `end`, zero-filled.
- `GET /api/reports/category-spending/?month=YYYY-MM` returns
  `{"month", "categories": [{"category_id", "name", "spent_cents",
  "direct_cents", "subcategories": [{"category_id", "name",
  "spent_cents"}]}], "uncategorized_cents"}`, sorted by `spent_cents`
  descending, with zero or negative rows omitted.

The frontend sends `end`/`month` from the browser's local date, so "the
current month" is the user's, not the UTC server's. A missing or malformed
parameter returns 400, the same as `BudgetSummaryView`.

*Why a new app:* both views aggregate across `accounts`, `transactions`
and `budgets`, and none of those apps owns that. *Alternative:* adding the
views to `transactions`. Rejected so cross-app reporting has one home as
more reports arrive.

### Aggregation
- Cash flow: filter `account__archived=False, date__gte=start,
  date__lt=end_exclusive`, then `TruncMonth("date")` and
  `Sum(Case(amount>0))` / `Sum(Case(amount<0))` in one `values().annotate()`.
  Then zero-fill the 12 months in Python.
- Category spending: one `values("category_id").annotate(net=Sum("amount_cents"))`
  over the month for active accounts, plus a separate outflow-only sum for
  `category__isnull=True`. Roll up in Python using `Category.parent_id`. A
  parent's `spent_cents` is its direct net plus each subcategory's net. A
  subcategory row is listed only if its own net outflow is positive. The
  parent is kept if its rolled-up total is positive, even when its direct
  net is negative (a refund on the parent itself). Reuse `parse_month` /
  `month_range` from `budgets.utils`.

### Recharts for the In vs out chart
Build it with Recharts' `BarChart` (two `Bar`s, `XAxis`, `YAxis`,
`CartesianGrid`, a custom `Tooltip` content component and `Legend`)
inside a `ResponsiveContainer`. Colours, gridlines and text are set from
CSS variables (`fill="var(--chart-series-1)"`, etc.), so dark mode keeps
working through the existing token switch with no JS theme logic. Tooltip
and legend content are our own components, styled with the app's ink and
surface tokens rather than Recharts' defaults. Animation is off, so
updates don't jitter.

*Alternatives considered:* hand-rolled SVG like `ForecastChart`. It works
for one chart, but every new chart would mean rebuilding axes, ticks,
tooltips and resizing. Chart.js and ECharts draw on canvas, which can't
be themed from CSS tokens and is opaque to Testing Library and screen
readers; ECharts is also much heavier. visx is a set of low-level
primitives, so most of each chart would still be built by hand.

*Testing:* `ResponsiveContainer` measures its parent, which has no size
in jsdom, so nothing renders. `InOutChart` takes an optional `width` prop
that bypasses the container (a fixed-size `BarChart`), and tests pass it.
The page itself renders the responsive version.

### Charts: forms and colour (per the dataviz method)
- **In vs out**: grouped vertical bars, one shared y-axis starting at
  zero, two series. Colours are categorical slots 1 (blue, existing
  `--chart-series-1`) and 2 (orange), added as `--chart-series-2`:
  `#eb6834` light / `#d95926` dark. The pair was validated with
  `validate_palette.js` in both modes: all checks pass, with no contrast
  warnings. In and out aren't drawn in the success/critical status colours,
  because status colours are reserved for state. There's a legend above the
  plot. Bars have a 4px rounded top and a 2px gap within each pair. Hover
  works per month column, with a hit area the full column width. Labels
  use ink tokens, never series colours.
- **Expenses per category**: horizontal bars, single series
  (`--chart-series-1`), so no legend. The category name and amount are
  labelled directly at each bar. It's built as an HTML list of rows with
  CSS-width bars rather than SVG, because rows grow and shrink on expand
  and long names need to wrap. Each row is a `<button>` when it can be
  expanded (`aria-expanded`), with the subcategory rows indented below it.
- Both charts have a "Show table" toggle like `ForecastChart`. The In vs
  out chart's wrapper gets `role="img"` and an `aria-label` summary.

### Components and data flow
`DashboardPage` loads the two endpoints independently, each with its own
loading/error state, so one failure doesn't blank the other. It keeps the
selected month in state and refetches category spending when that month
changes. A failed load calls `toast.error` and shows an inline "Couldn't
load" in that card. `InOutChart` and `CategorySpendingChart` are
presentational, taking the API payload as props.

## Risks / Trade-offs

- [Recharts adds a sizeable chunk to the JS bundle] → acceptable for a
  self-hosted personal app; check the `npm run build` output size, and if
  it's a problem, lazy-load the dashboard route.
- [Recharts' default styling clashes with the app] → tooltip and legend
  are custom components, and colours come from CSS tokens, not props.

- [Transfers between own accounts inflate both in and out] → documented
  as a known limitation in the proposal. A future transfer concept would
  exclude them here.
- [A browser-local month near midnight UTC can differ from the server's
  idea of the month] → the client always sends the month explicitly, so
  the server never guesses.
- [Large amounts squash small categories into slivers] → every bar is
  labelled with its amount, and the table view gives exact figures.
- [A 12-month window is fixed] → the endpoint takes `end`, so a range
  picker can be added later without an API change.

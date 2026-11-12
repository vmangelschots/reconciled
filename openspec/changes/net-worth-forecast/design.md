# Design

## Context

- **`forecasting/forecast.py`** builds the Everyday forecast from five
  collectors that read each rule from its owner: `_bill_items`,
  `_installment_items`, `_monthly_budget_items`, `_yearly_items` and
  `_expected_items`. Each returns dated items, with budgets spread per day.
  - `_installment_items(today, end, tier)` keeps only loans paid from the
    pot and takes the full payment.
  - `_expected_items(today, end, tier)` takes every expected item.
- **`reports/balances.py`** has `net_worth_at(end)` (today's total, as the
  history counts it) and `month_end_balances(today)` for the history.
  `NetWorthView` returns `{"months": [...]}`.
- **`transactions/loans.py`**'s `Installment` carries `payment_cents` and
  `interest_cents`.
- **`NetWorthChart.jsx`** (Recharts) draws the history with 1Y / 5Y / All
  ranges, Januaries as ticks once it spans years, and a tooltip with tiers.
- **`ForecastingPage.jsx`** has a horizon `PillSwitch` synced to
  `?days=`, the summary panel, Coming up and the Expected panel with its
  sheet.

See proposal.md for the motivation and specs/ for the behaviour.

## Goals / Non-Goals

**Goals:**
- One set of collectors serves both forecasts. Net worth differs only in
  how installments and transfer items count, and in its starting point and
  granularity.
- The Overview projection and the Forecast page's net worth view agree
  over the months they share.

**Non-Goals:**
- Per-tier projections. Only the total is forecast; tiers aren't split.
- Storing anything. Both forecasts stay pure computations per request.

## Decisions

### Collectors take a mode instead of being copied
- `_installment_items(today, end, tier, interest=False)`:
  - `tier=None` takes every loan on an active account.
  - `interest=True` takes `-installment.interest_cents` instead of the
    payment.
  - The state rules are unchanged: posted and covered installments are
    skipped this month, late ones move to tomorrow, and missed ones are
    dropped.
- `_expected_items(today, end, tier, transfers=True)`: with
  `transfers=False`, items recognised by an account are skipped. They are
  money between the user's own accounts.
- Bills, budgets and targets are used as they are.

*Alternative:* derive net worth from the Everyday forecast by adding
principal and transfers back. Rejected: the Everyday forecast leaves out
loans paid from outside the pot, so the result would still be wrong.
Asking each collector for the right amount is simpler and exact.

### `net_worth_forecast(today, months)`
It returns `{start_cents, months: [{month, total_cents, change_cents}],
has_income, empty}`.
- **Start:** `net_worth_at(today)`, so the first point equals the current
  month of the history.
- **End:** the last day of the month `months` months after this one. The
  current month's own end is the first month reported, then each month
  after it, so `months + 1` rows.
- **Totals:** the items are summed per calendar month. Spread budgets go
  in by their daily amounts, so a spread that crosses into the next month
  lands in the right month. Each month's total is the running sum at its
  last day.
- **`empty`** is true when there are no items, and drives the "Nothing
  expected" state and the absent Overview projection.
- **`has_income`** works as in the Everyday forecast. It decides whether
  the no-income note shows; this chart has no critical colour.

The 5-year horizon calls `monthly_limits` once per month (about 60 calls).
That is fine for a per-request computation. A month's budget spread
outside the horizon isn't counted, as in the Everyday forecast.

### API
- `GET /api/forecast/net-worth/?years=1|3|5` returns
  `net_worth_forecast(today, 12 * years)`. Any other value returns 400.
- `NetWorthView` adds `projection`: the months after the current one from
  `net_worth_forecast(today, 12)`, or `null` when `empty`.
- Both use `budgets.utils.today()` and `reports.views._today()`
  respectively, so tests can freeze them the way they already do.

### Forecast page
- **Address:** `?view=net-worth&years=3`. A missing or unknown `view`
  means Everyday, and `years` defaults to 1. Switching views drops the
  other view's parameter.
- **Header:** the view switch is a `PillSwitch` ("Everyday" / "Net
  worth"), then the horizon `PillSwitch` for that view. Both wrap onto
  their own row on a phone, as the `PageHeader` children already do.
- **Net worth summary panel:**
  - three `Stat size="sm"`: Today with its date, Change signed (whole
    euros), and "In N years" with its month;
  - the caption;
  - the stale-import line for all active accounts, since every account
    counts;
  - the no-income note;
  - the chart, or the empty state.
  - Coming up isn't rendered in this view. The Expected panel stays.
- **`NetWorthForecastChart`** is a new component, kept small. It is a
  Recharts `Line` (`type="monotone"`, no dots) over the month points:
  - the Y axis domain spans the values, plus zero when in range;
  - ticks: every month for 1 year, Januaries for 3 or 5 years (reusing
    `xTicks` from `NetWorthChart`);
  - the tooltip shows the `monthLabel`, the total and the signed change.

  It doesn't reuse `ForecastChart`: that chart is daily and stepped, with
  low labels and critical colours this one must not have.

### Overview net worth chart
- `NetWorthChart` gets `projection` (rows `{month, total_cents}`).
- The chosen range slices the history only, and the projection is
  appended.
- Rows carry `total_cents` for history and `projected_cents` for the
  projection. The current month carries both, so the lines join, as
  `EverydayMoneyChart` does.
- The dashed `Line` uses the series colour with `strokeDasharray="5 5"`
  and no fill.
- `NetWorthTooltip` shows "<month> · Projected", the total and the change
  for a projected row, without tiers.
- The month marker and the end label stay on the current month.

## Risks / Trade-offs

- **Budgets are assumed to be fully spent every month.** That makes the
  forecast pessimistic when the user usually underspends. → It is
  consistent with the Everyday forecast, and the caption says what counts.
- **Flat investments and property** understate long-term net worth. → The
  caption says so. Returns are out of scope.
- **Future bills and budgets repeat today's amounts for 5 years.** → Fine
  for a projection. Raises and price changes are out of scope.
- **A loan category's own extra spending** isn't forecast beyond the
  interest. → It is spending without a budget, which the caption already
  leaves out.

## Migration Plan

None. Code only, with no data changes.

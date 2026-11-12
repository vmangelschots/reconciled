# Design

## Context

- **Forecast today:**
  - `forecasting/utils.py` `generate_forecast(account, …)` projects one
    account from `RecurringTransaction` rows.
  - It also handles a loan account's own schedule, and the installments
    that leave the account a loan is paid from.
  - `reports/views.py` `_projection` adds up the per-account forecasts of
    the tier's accounts, on top of `tier_balance(tier, today)`. That
    history balance also counts rows dated later.
- **Budget figures already exist**, shared by Budgets and the Overview:
  - `budgets/summary.py` `budget_rows(month, today)`: each category's
    limit and spending, with a parent's budget covering its subcategories
    and caps marked.
  - `budgets/yearly.py` `yearly_rows(month, today)`: yearly budgets and
    targets, with what's left and the target state.
  - `budgets/bills.py` `bill_rows`: each bill's state. Matching uses the
    stored category, which also holds an unconfirmed AI guess
    (`category_confirmed=False`), so guesses already count.
  - `transactions/loans.py` `installment_states(loan, today)`: posted,
    covered, missed, due or upcoming.
- **Frontend:**
  - `ForecastingPage.jsx` has an account Select, a recurring form and
    table, and a hand-drawn SVG `ForecastChart`.
  - `EverydayMoneyChart.jsx` (Recharts) already draws a stepped dashed
    projection, a low label and the critical colour below zero.
  - The Overview lays out its Panels in an `lg:grid-cols-3` grid.

See proposal.md for the motivation and specs/ for the behaviour.

## Goals / Non-Goals

**Goals:**
- One function computes the Everyday forecast. The Forecast page and the
  Overview projection both use it, so they never disagree.
- Every rule is read from the code that owns it: bill states, installment
  states, budget figures and target states. Nothing is re-derived.

**Non-Goals:**
- Storing forecast results. It stays a pure computation per request.
- Changing how bills, installments or targets are matched or judged.
- Forecasting spending in categories without a budget.

## Decisions

### A pure `everyday_forecast(today, horizon_days)` in `forecasting/forecast.py`
It returns `{tier, start_balance_cents, items, missed, points, lowest,
has_income}`.

- **Start.** The tier is `history_tier()` and the start balance is
  `tier_balance(tier, today)`, both from `reports/balances.py`, so it
  matches the Overview.
- **Items.** Each item is `{date, amount_cents, name, source, detail,
  late_since, link}`:
  - `source` is `bill`, `installment`, `budget`, `target` or `expected`.
  - `link` carries what the frontend needs to open it: a category id and
    month, a loan account and installment number, or an expected item id.
- **Budget items** come as one item per budget per month, for the list,
  plus a daily amount. The item's date is the first forecast day in that
  month, with `{total_cents, per_day_cents, until}`.
- **Points.** Each day's point applies that day's dated items and the
  daily amount of every budget active that day. Daily amounts are spread
  with the remainder in cents on the last day, so the month's total is
  exact.
- **Lowest** is the lowest point after today.
- **`has_income`** is `ExpectedItem.objects.filter(direction="in").exists()`,
  independent of the window (spec "Income is expected").
- **`missed`** lists this month's missed bills and installments, for the
  greyed lines.

Collectors, each reading the owner's rules:

| Collector | Current month | Later months |
|---|---|---|
| `_bill_items` | `bill_rows` for non-loan Bills categories; keep upcoming, due_soon and not_seen; not_seen or due ≤ today → tomorrow; missed → `missed` | bills that `counts_in`, on `due_date` |
| `_installment_items` | loans on active accounts with `paid_from` in the pot; `installment_states`; due ≤ today → tomorrow; missed → `missed` | upcoming installments on their date |
| `_budget_items` | `budget_rows`: each category with a monthly limit that no parent budget covers, `max(limit − spent, 0)`, minus its Bills subcategories' unpaid bills for the month, spread over the days after today | the month's limit (`monthly_limits` with overrides), minus that month's sub-bills, over all its days |
| `_yearly_items` | `yearly_rows`: a yearly budget's `max(left, 0)`, minus sub-bills for the rest of the year, spread over the rest of the year; a target, if not paid: its left amount on its due date (not seen → tomorrow; overdue → skipped) | next year's amount over its days; next year's target on its due date |
| `_expected_items` | skip received items; due ≤ today → tomorrow while tomorrow is in the month | every item on its day |

- **Spreading** treats the horizon one month at a time: months for monthly
  budgets, the remaining year for yearly ones. Days beyond the horizon are
  simply not drawn.
- **Sub-bills** are subtracted from a covering parent so bills aren't
  counted twice. When a parent budget is smaller than its bills, the
  spread is 0, never negative.
- **Recognition** runs one query per current month. It builds
  `(category id, direction, amount)` rows from `counted_rows()
  .excluding_adjustments()` and transfer rows dated this month. An item
  counts as received when a row in its category, a subcategory or a
  transfer to or from its account goes its direction with
  `abs(amount − item) ≤ 25% of item`. Subcategories use the category
  tree that budgets already use.

*Alternative:* extend `generate_forecast` per account and add the results
up. Rejected: bills and budgets have no account, and the per-account
forecast is what this change removes.

*Alternative for spending:* the average spending of the last 3 months.
Rejected: the user chose budgets, which they control and which already
exist.

### `ExpectedItem` replaces `RecurringTransaction`
`forecasting.ExpectedItem` is a household-scoped model:
- `name`;
- `direction` (`in` or `out`);
- `amount_cents > 0`;
- `day` (1 to 31);
- `category`, nullable, `SET_NULL`;
- `account`, nullable, `SET_NULL`, for transfers;
- timestamps.

It has no months. The forecast only looks forward, so no history is
needed.

The serializer requires exactly one of category and account. It rejects:
- a category with a budget, or one covered by a budgeted parent (reusing
  `has_budget` and `subcategories_by_parent` from `budgets/summary.py`);
- a loan payment category (`budgets/loan_categories.py`);
- a tab or tab group;
- an account in the pot;
- an archived account.

If a category or account is later deleted, `SET_NULL` leaves the item
unrecognisable. The Expected panel then shows it with a "Choose how to
recognise it" warning, and the forecast keeps it as unrecognisable: never
received, so expected until month end. This is rare, and the item stays
visible.

A category can become budgeted after an item uses it. The serializer only
checks on save. The forecast then skips such an item and the panel marks
it "Already in a budget". This is consistent with "doesn't double another
item".

*Alternative:* keep `RecurringTransaction` and make `account` nullable.
Rejected: frequency, start and end dates and the per-account meaning would
all linger as dead options.

### Migration and backups
A data migration creates an expected item for each `RecurringTransaction`
that is monthly, has no `end_date` before today, and has a category an
item may use:
- `name` is `payee`, and `direction` follows the sign;
- the amount is the absolute amount, and `day` is `start_date.day`.

It logs every row it drops. The next migration deletes the model.

`backup/format.py` bumps `FORMAT_VERSION` to 3 and adds a 2 → 3
converter that applies the same rules, so old backups still restore.

### API
- `GET /api/forecast/?horizon_days=30|90` returns `everyday_forecast`,
  with dates as ISO strings, plus the pot's accounts with their import
  freshness (`import_freshness`, shared with the Overview), which the
  frontend phrases with `staleImports`. It replaces `?account=`.
- `/api/expected-items/` is a `ModelViewSet` that replaces
  `/api/recurring-transactions/`. Each item carries `status`
  (`received` / `next` / `late` / `unrecognisable` / `budgeted`),
  `received_on` and `next_on`. These come from the same helper as
  `_expected_items`.
- `/api/expected-items/options/` returns the allowed categories and the
  allowed accounts for the sheet's picker.
- `reports/views.py` `_projection` calls `everyday_forecast(today, 30)`
  and returns `None` when there are no items. The `everyday-balance`
  response gains `has_income`.

### Frontend layout

```
Forecast                                   [30 days | 90 days]  <- PillSwitch in PageHeader
+--------------------------------------+  +---------------------+
| TODAY       LOWEST       IN 90 DAYS  |  | Expected   [Add item]|
| €1,840      €312         €2,105      |  | 25 Salary   +€4,500 |
| Thu 12 Nov  27 Nov       10 Feb      |  |    Received 24 Nov  |
| Bills, loans, budgets and expected   |  |  1 Savings    -€500 |
| items. Spending without a budget...  |  |    Next 1 Dec       |
| (i) Only money going out is counted. |  +---------------------+
|     Add your salary ...              |
| [solid line, zero axis, Low label]   |
+--------------------------------------+
+ Coming up ---------------------------------------------+
| THU 13 NOV                                     €1,828  |  <- surface-2 subheader
|   Disney+ [Not seen]                          -€11.99  |
|   Bill · Streaming · due 8 Nov                         |
|   Groceries                                  -€220.00  |
|   Budget · €220 left, spread to 30 Nov                 |
| FRI 21 NOV                                     €1,612  |
|   Spotify                                     -€10.99  |
|   Bill · Streaming                                     |
| ...                                                    |
|   (greyed) Spotify  Missed · not counted       €10.99  |
+--------------------------------------------------------+
Phone: figures+chart -> Expected -> Coming up
```

- **Panels.** The figures, caption, note and chart share one `Panel`.
  Expected is `Panel title="Expected" actions={Add item}`. Coming up is
  `Panel title="Coming up" flush` with `ul divide-y`. The page uses the
  Overview's `lg:grid-cols-3`: the main panel spans two columns and
  Expected takes one. On a phone they stack in DOM order (main, Expected,
  Coming up). Panel `loading` and `error` states come for free.
- **`Stat` gets `size="sm"`** (`text-lg` below `sm:`) and a detail line
  for the date. Lowest uses `tone="critical"` only when `has_income` and
  below zero.
- **The horizon switch** is a `PillSwitch` in the `PageHeader`, synced to
  `?days=`.
- **`ForecastChart` is rewritten in Recharts**, sharing `PointLabel`, the
  below-zero gradient and the low-label logic with `EverydayMoneyChart`
  in `components/chart/projection.jsx`.
  - Props are `critical` and `dashed`, the latter false on this page.
  - Ticks fall on Mondays at 30 days and on month starts at 90.
  - The tooltip shows at most 3 items and then "+N more".
  - Budgets show in the line's slope, not in the tooltip.
- **Coming up:**
  - Day subheaders use `bg-surface-2 text-xs`, with the date muted and the
    balance in whole euros, `num text-ink-secondary`. A negative balance
    is critical when `has_income`.
  - Rows are `ListRow`s: the name with an optional `StatusBadge`, a
    caption line, and the amount in cents.
  - Missed rows are `opacity-60` with "Missed · not counted", placed under
    their original day. The list starts at the 1st of the month, without
    balances for past days, only when there are missed items. Otherwise
    it starts tomorrow.
  - Choosing a row navigates:
    - bills and budgets to `/budgets?month=YYYY-MM&category=<id>`;
    - installments to `/transactions/<loan>/schedule?installment=N`;
    - expected items to their sheet.
- **The Budgets page** reads `category` from the address and opens that
  sheet. Closing the sheet removes it from the address.
- **The expected item sheet** uses `Sheet` (a bottom sheet on a phone):
  - an In/Out `SegmentedControl`;
  - name, amount and day `Input`s;
  - "Recognise by", a `CategoryCombobox` fed from `options/` with two
    groups, "Categories" and "Transfer to or from";
  - the direction-dependent hint;
  - Save, Cancel and, in edit mode, Delete.
- **The no-income note** is neutral (`surface-2`, Info icon, accent link
  "Add expected income", which opens the sheet set to In). It shows only
  when there are expected items and none goes in. Otherwise the empty
  Expected panel carries the call to action.
- **Nothing coming up.** An `EmptyState` replaces the chart and the Lowest
  figure. Today and "In N days" stay.
- **`EverydayMoneyChart`:**
  - "Add expected income" links to `/forecast?days=30` when there's no
    projection.
  - With `has_income` false it shows "No income expected", a muted accent
    link, and passes `critical={false}`.

## Risks / Trade-offs

- **The spread budget is an average.** Real spending is lumpy, so the line
  is smoother than reality. → The caption says what is counted. A
  forecast should be roughly right, not exact.
- **Overspending this month shows as "nothing left".** Being already over
  a limit doesn't push the forecast lower. → It is already in the balance.
  The Budgets page shows the overspend.
- **Uncategorised payments without a guess aren't recognised**, so a bill
  or salary can count twice for a few days. → AI guesses do count, and
  Review clears the rest. Accepted.
- **Recognition takes the first transaction within 25%.** A December
  bonus close to the salary amount could mark the salary received. →
  This is rare. "Received 18 Dec" makes it visible.
- **A bill paid from a savings account is still forecast in the pot.** →
  Rare. It shows as paid once it happens.
- **Dropping recurring transactions loses data** (weekly, yearly, without
  a category). → The household has none. The migration logs what it drops
  and the release notes say so.

## Migration Plan

1. Deploy the migrations: create `ExpectedItem`, convert, then delete
   `RecurringTransaction`.
2. Rolling back needs the backup made before the deploy, since the old
   table is gone. The usual pre-deploy backup covers it.

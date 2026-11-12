# Design

## Context

- **Forecast today.** `forecasting/utils.py` `generate_forecast(account, …)`
  projects one account from `RecurringTransaction` rows. It also handles
  a loan account's own schedule, and the installments that leave the
  account a loan is paid from.
- **Overview projection.** `reports/views.py` `_projection` adds up the
  per-account forecasts of the tier's accounts, on top of
  `tier_balance(tier, today)`. That history balance also counts rows dated
  later.
- **Bills.** `budgets/bills.py` already works out each bill's state per
  month (`bill_rows`, `bill_state`, `as_of`). It matches bills against the
  month's outflows, and nothing is stored.
- **Loans.** `transactions/loans.py` `installment_states(loan, today)` gives
  every installment's state: posted, covered, missed, due, upcoming or
  before setup.
- **Forecast page.** `ForecastingPage.jsx` has an account Select, a
  recurring-transaction form and table, and a hand-drawn SVG
  `ForecastChart`.
- **Overview chart.** `EverydayMoneyChart.jsx` is Recharts. It already
  draws a stepped dashed projection, a low label and the critical colour
  below zero.

See proposal.md for the motivation and specs/ for the behaviour.

## Goals / Non-Goals

**Goals:**
- One function that computes the Everyday forecast's items and points.
  The Forecast page and the Overview projection both use it, so they never
  disagree.
- Bills and installment states are read from their existing code, not
  re-derived.

**Non-Goals:**
- Storing forecast results. The forecast stays a pure computation per
  request, like bills.
- Changing how bills or installments are matched.

## Decisions

### A pure `everyday_forecast(today, horizon_days)` in `forecasting/forecast.py`
It returns `{tier, start_balance_cents, items, points, lowest, has_income}`:

- **Pot.** The pot is `history_tier()`, and `start_balance_cents` is
  `tier_balance(tier, today)`, both from `reports/balances.py`. It matches
  the Overview's balance and treats rows dated later the same way.
- **Items.** Each item is `{date, amount_cents, name, source, late_since,
  link}`:
  - `source` is `bill`, `installment` or `expected`.
  - `late_since` is the original day for an item moved to tomorrow.
  - `link` carries what the frontend needs to open the item: the bill's
    category and month, the loan's account and installment number, or the
    expected item's id.
- **Months.** Items come per month from the current month to the horizon's
  last month. The current month uses states as of today. A later month
  takes every item on its day.
- **Points.** One point per day, from `start_balance_cents` plus the items
  up to that day. `lowest` is the lowest point after today.

Three small collectors build the items, each from the code that owns its
rules:
- **`_bill_items`.** For the current month it calls `bill_rows` for the
  non-loan Bills categories, and keeps the lines with state upcoming,
  due_soon or not_seen. A line dated today or earlier moves to tomorrow.
  Later months have no states that matter, so it reads the bills
  directly: every bill that `counts_in` the month, on its `due_date`.
- **`_installment_items`.** It takes the loans on active accounts whose
  `paid_from` is in the pot and reads `installment_states(loan, today)`. It
  keeps due and upcoming installments within the horizon, and moves a due
  one dated today or earlier to tomorrow. Posted, covered, missed and
  before-setup installments are skipped.
- **`_expected_items`.** It handles each `ExpectedItem` per month. In the
  current month it skips a received item, and moves an item dated today or
  earlier to tomorrow. "Received" is one query per month: a set of
  `(category id, direction)` from `counted_rows()` (split parts, no
  adjustments), plus `(transfer account id, direction)` from transfer rows
  dated this month. A category matches its subcategories through the
  category tree already used by budgets.

*Alternative:* extend `generate_forecast` per account and add the results
up. Rejected: bills have no account, and the per-account forecast is what
the change removes.

### Late items stop at the month's end
A late expected item is moved to tomorrow only while tomorrow is still in
its month. On the last day of the month it drops out, so an item never
counts twice when the next month's comes along. For bills, `bill_state`
already turns a late bill into missed after the grace days, or once the
month is over. Loans follow `is_missed`.

### `ExpectedItem` replaces `RecurringTransaction`
`forecasting.ExpectedItem` is a household-scoped model with these fields:
- `name`;
- `direction` (`in` or `out`);
- `amount_cents > 0`;
- `day` (1 to 31);
- `category`, nullable, `SET_NULL`;
- `account`, nullable, `SET_NULL`, for transfers;
- timestamps.

The model has no months. The forecast only looks forward and nothing reads
past months, so a from/until history like bills have isn't needed.

The serializer validates that the category and the account aren't both
set. It also rejects:
- a Bills category or a loan's payment category (reusing
  `budgets/loan_categories.py`);
- an account in the pot;
- an archived account.

*Alternative:* keep `RecurringTransaction` and make `account` nullable.
Rejected: frequency, start and end dates and the per-account meaning would
all linger as dead options.

### The migration converts, then drops
A data migration creates an expected item for each `RecurringTransaction`
that is monthly and has no `end_date` before today:
- `name` is `payee`, and `direction` follows the sign;
- the amount is the absolute amount, and `day` is `start_date.day`;
- the category is kept only if it is allowed (see above);
- `account` stays empty.

The next migration then deletes the model. The backup's version-1 and
version-2 converters do the same, so old backups still restore. That means
bumping `FORMAT_VERSION`, with a converter in `backup/format.py`.

### API
- `GET /api/forecast/?horizon_days=30|90` returns the
  `everyday_forecast` result. It replaces `?account=`.
- `/api/expected-items/` is a `ModelViewSet` that replaces
  `/api/recurring-transactions/`. Each item carries its month status
  (`received_on`, `expected_on`, `late`), computed by the same helper that
  `_expected_items` uses.
- `reports/views.py` `_projection(tier, today)` becomes a thin wrapper:
  `everyday_forecast(today, 30)`, returning `(points, lowest)`, or `None`
  when there are no items. `has_income` goes into the
  `everyday-balance` response for the "No income expected" note.

### Frontend layout

```
Forecast                                   [30 days | 90 days]
+--------------+--------------+--------------+
| Today        | Lowest       | In 90 days   |   Stat x3 (one row,
| €1,840       | €312 · 27 Nov| €2,105       |   compact on a phone)
+--------------+--------------+--------------+
( ! No income expected: this forecast only counts what goes out
    [Add expected income] )                  <- only when has_income false
+--------------------------------------------+
|  stepped line, zero axis, "Low ..." label  |   ForecastChart (Recharts)
+--------------------------------------------+
Coming up
  Thu 13 Nov                         €1,828
    Disney+        Bill · Streaming  -€11.99
    Due 8 Nov · not seen yet  (warning)
  Fri 21 Nov                         €1,612
    Spotify        Bill · Streaming  -€10.99
  Tue 25 Nov                         €6,112
    Salary         Expected · Salary +€4,500   (positive colour)
  ...
Expected                                     [Add expected]
  25  Salary     +€4,500   Received 24 Nov
   1  Savings      -€500   Expected 1 Dec
```

- **`ForecastChart` is rewritten in Recharts**, sharing `ProjectionStroke`,
  `PointLabel` and the low-label logic with `EverydayMoneyChart`. These
  move into `components/chart/projection.jsx`, so both charts look and
  behave alike. It takes a `critical` prop that is false when
  `has_income` is false. Its tooltip lists the day's items.
- **Coming up** uses `ListRow`. A day header shows the date in the
  `EverydayTooltip` format and the balance after that day, right-aligned.
  Choosing an item navigates:
  - a bill to `/budgets?month=YYYY-MM`;
  - an installment to `/transactions/<loan account>/schedule?installment=N`;
  - an expected item to its sheet.
- **The expected item sheet** reuses `Sheet` (a bottom sheet on a phone)
  and holds:
  - an In/Out `SegmentedControl`;
  - name, amount and day `Input`s;
  - "Recognise by", one `CategoryCombobox` whose list holds the allowed
    categories followed by the allowed accounts, as the ledger's transfer
    picker does;
  - the hint "When something lands here this month, the forecast counts it
    as received.";
  - Save, Cancel and Delete (in edit mode).
- **The horizon switch** is a `SegmentedControl`. It replaces the three
  buttons, and the 1-year option goes.
- **`EverydayMoneyChart`** links "Add expected income" when there is no
  projection. With `has_income` false it shows "No income expected" and
  passes `critical={false}`.

### Wording
English, in the app's existing voice: "Coming up", "Expected", "Add
expected", "Received 24 Nov", "Expected 25 Nov", "Due 8 Nov · not seen
yet", "Nothing expected in the next 90 days".

## Risks / Trade-offs

- **A bill paid from a savings account is still forecast in the Everyday
  pot.** → This is rare, and the bill would show as paid once it happens.
  Accepted.
- **Recognition ignores the amount.** A small refund in "Salary" would mark
  the salary as received. → Accepted for simplicity, as the user chose. The
  Expected list shows "Received 24 Nov", so a wrong match is visible.
- **Dropping weekly, biweekly and yearly recurring transactions loses
  data.** → The household has none. The migration logs what it dropped.
  Other households on the instance are few and are told in the release
  notes.
- **`items` from a 90-day window can be long.** → A month holds about ten
  bills, so the list stays well under a hundred rows. No paging.

## Migration Plan

1. Deploy the migrations: create `ExpectedItem`, convert, then delete
   `RecurringTransaction`.
2. Rolling back needs the backup made before the deploy, since the old
   table is gone. The usual pre-deploy backup covers it.

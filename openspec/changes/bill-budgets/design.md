# Design

## Context

Budget figures are computed per request, nothing is stored:
- `budgets/summary.py` builds the monthly rows and totals.
- `budgets/yearly.py` builds the yearly and on-a-date rows and holds the
  date and tolerance rules as plain functions.
- `budgets/attention.py` picks the warnings.

`BudgetSummaryView` (Budgets page) and the overview endpoint
(`reports/views.py`) both call these, so the two pages can't disagree.
Monthly limits live in `CategoryLimit` (a default plus per-month
overrides). `monthly_limits()` feeds `has_budget()`, `covered_by_parent`,
caps and `budget_totals()`.

On the frontend:
- `lib/budgetOverview.js` turns the summary into rows (`monthlyRow`,
  `yearlyRow`, `targetRow`), warnings and the verdict.
- `BudgetEditor.jsx` has the kind switch (`KINDS`) and the
  `droppedSentence` confirm.
- The tile (`OverviewPage`) and the headline (`BudgetsPage`) put
  `summary.pace` on the bar and compute per-day from `days_left`.

See proposal.md for the motivation and specs/ for the behaviour.

## Goals / Non-Goals

**Goals:**
- Bills plug into the existing rows, totals and attention pipeline, so
  the tile, headline, Needs attention and Needs a look agree without
  extra wiring.
- Matching and states are plain, deterministic functions of the bills
  and the month's outflows, and can be tested without the database.

**Non-Goals:**
- Stored matches, or the user picking which payment pays a bill.
- Bill history. A bill has a start month and no versions: editing or
  removing it changes every month it counts in. #62 may revisit this for
  "just this month".
- Loans as bill lines (#61).

## Decisions

### A `Bill` model with a start month
`budgets.Bill(HouseholdScoped)` has `category` (FK, CASCADE), `name`,
`day` (1–31), `amount_cents` (> 0), `from_month` (first of the month it
was added) and timestamps. `household_path = "category__household"`.
`Category.BudgetKind` gains `BILLS = "bills"`, which fits the existing
`max_length=10`. A bill counts in month M when `from_month <= M`.

*Alternative:* versioned rows like `YearlyBudget` (one row per change
month). That gives correct history, but nobody asked for it, and it
complicates the inline editor. `from_month` is the minimum that keeps
older months from suddenly showing a newly added bill as missed.

### Matching is computed, not stored
`budgets/bills.py` holds pure functions:
- `due_date(month, day)` clamps to the month's last day.
- `match(bills, outflows)` returns `{bill_id: outflow}`.
- `bill_state(bill, due, payment, ref_day, month_over)`.
- `paid_tolerance(amount)` is the larger of 5% and 1.00.
- `amount_window(amount)` is the larger of 30% and 5.00.

The constants (window 4 days, due soon 3 days, grace 5 days) live there.

`match` goes through the bills in order of day, then id. For each bill it
takes the unused outflow in the same month, within 4 days of the due date
and inside the amount window, closest in amount, then in date, then
lowest id for determinism. This is greedy rather than optimal assignment.
For a handful of bills per category, greedy-by-day is predictable and
matches how people read it.

A DB layer, `bill_rows(categories, month, today)`, loads the bills that
count in the month and the month's outflows, then calls the pure
functions. Outflows are `counted_rows().excluding_adjustments()` with
`amount_cents < 0` and a category of the Bills category or its
subcategories, loaded in one query for all Bills categories.

*Alternative:* store matches like loan installments (`sync_loan`). That
needs sync triggers on import, edit and delete, plus stale-match
cleanup. Computing on read is cheap here (one extra query per summary)
and is never out of date.

### Bills ride along in `budget_rows`
- `monthly_limits(period_start)` also returns each Bills category's
  total for the month, as long as it has bills that count. Then
  `has_budget`, `covered_by_parent`, caps and `budget_totals` treat a
  Bills budget exactly like a limit, which is what the "Bills in the
  month's totals" requirement says. The `overridden` set is unchanged.
- `budget_rows` iterates monthly and Bills categories. A Bills row adds
  `kind: "bills"` and `bills: [{id, name, day, due_date, amount_cents,
  state, paid_on, paid_cents, over_cents}]`. It also adds `paid_count`,
  `due_to_date_cents` (bills due by the reference day) and
  `unpaid_cents` (bills without a payment). Monthly rows get
  `kind: "monthly"`. Its spending is the usual net outflow.
- `yearly_spent_cents`'s owner logic uses `has_budget`, so a Bills parent
  owning a yearly subcategory keeps working.

### Pace and per-day from the totals
`budget_totals(rows, pace)` adds two figures, only for the current month:
- `marker`: `(due_to_date + pace * (limit_total - bills_total)) /
  limit_total`, over the counted (not covered) rows.
- `bills_unpaid_cents`: the sum of `unpaid_cents` over those rows.

Without bills, `marker == pace`, so nothing changes for existing
households. The tile and the headline put `totals.marker` on the bar and
compute per-day from `left - bills_unpaid_cents`. The row-level
`summary.pace` stays for monthly and yearly rows. Bills rows ignore it.

*Alternative:* leave Bills out of the totals. Then the headline stops
showing money the household has committed to, and "€X left" means
something new. Counting them, with an expected-to-date marker, keeps
the meaning.

### Attention
- `attention_categories(rows, pace)` skips the "ahead" rule for
  `kind == "bills"`. Over still applies, which gives "Streaming €12
  over".
- A new `attention_bills(rows)` returns `[{category_id, category_name,
  parent_name, bill_id, name, due_date, amount_cents}]` for missed
  bills, sorted by due date and then name.
- Both endpoints return it as `attention.bills`. The overview puts it
  after the yearly items and before missed loans. `verdict()` counts it.

### API
- `PUT /api/categories/{id}/budget` accepts `kind: "bills"` without an
  amount. Switching to Bills deletes limits or yearly rows. Switching
  from Bills deletes the bills, inside the existing `transaction.atomic`.
- `PUT /api/categories/{id}/bills` takes `{bills: [{id?, name, day,
  amount_cents}]}` and replaces the list. Ids sent are updated and keep
  their `from_month`, new lines get the current month, and missing ones
  are deleted. It is rejected unless the category is Bills, with 400 on
  a bad day, an empty name or an amount <= 0. It returns the category.
- `CategorySerializer` adds `bills` (id, name, day, amount_cents,
  from_month), used by the editor and by `droppedSentence` ("its 3
  bills").

### Frontend
- `lib/budgetOverview.js`:
  - `billsRow(row)` returns `bills: [{amountCents, state}]` in place of
    `bar`.
  - The figure is "€X to pay", "Paid" or "€N over", and the caption is
    "n of m paid · <most pressing>".
  - `billWarning(b)` builds the Needs attention text.
  - `BILL_TONE` maps a state to its tone, next to `TARGET_TONE`.
- `components/BillBar.jsx`: a flex track with the same height, rounding
  and ring as `ProgressBar`. Each segment grows by its amount
  (`flexGrow`), with `gap-px` and a minimum width. The fills come from
  `BILL_TONE`.
- `BudgetRow` and the `BudgetSheet` header render `BillBar` when
  `row.bills` is set.
- `BudgetEditor`:
  - `KINDS` gains `{bills: "Bills"}`. `droppedSentence` covers both
    directions.
  - With Bills selected, the amount input becomes an inline list of
    day, name and amount lines, with "+ Add bill", the total, and the
    hint about the day.
  - Saving calls `setCategoryBudget({kind: "bills"})` when the kind
    changes, then `setCategoryBills`.
- The sheet lists the month's bills with `StatusBadge` chips (paid,
  "€2.00 over", in N days, not seen, missed). An upcoming bill shows no
  chip.

### Backup
Add `"budgets.Bill"` to `BACKED_UP_MODELS`, and to the restore order
after `Category`. This is a new model, not a reshape, so `FORMAT_VERSION`
stays. An older backup has no Bill rows and restores with none. The
model-coverage test in `backup/tests.py` enforces the list.

## Risks / Trade-offs

- [Greedy matching picks a "wrong" payment when two bills compete] →
  Ordering by day and choosing the closest amount resolves realistic
  cases. Same-amount bills on the same day are interchangeable.
- [A bill whose payment drifts across a month boundary shows as missed
  in one month and over in the next] → Accepted (the user called
  bookdate logic overkill). The editor hint asks for the day it actually
  leaves the account.
- [Editing a bill rewrites past months] → Accepted for now and recorded
  as a non-goal. `from_month` prevents the worst case, a new bill being
  missed in old months.
- [The tile's marker changes meaning slightly] → It now means "where
  spending should be by today". Without bills it's the old value, and a
  scenario pins the bills case.
- [A Bills parent with monthly subcategories: their outflows can pay a
  parent bill] → It follows the "a parent covers its subcategories" rule.
  Rare, and visible in the sheet.

## Migration Plan

One additive migration (the `Bill` table, plus the `bills` choice, which
has no DB effect). No data migration. Rolling back the code leaves an
unused table and Bills categories with an unknown kind, so roll back the
migration too, or switch those categories back first.

# Design

## Context

- **Budget data.** `budgets.models` has `Category` and `CategoryLimit`.
  A `CategoryLimit` row has `month` NULL for the default and a
  first-of-month date for an override.
- **Figures.** `budgets/summary.py` builds the month's rows
  (`budget_rows`) and uncategorized spend. Both the Budgets page
  (`BudgetSummaryView`) and the overview (`reports.views.OverviewView`)
  use it, so the two can't disagree. `OverviewView` builds the budget
  tile figures and `_attention_categories` from those rows, and gets
  "today" from `_today()` so tests can freeze it.
- **Settings.** The app has no settings model. `core.models` is empty.
- **Budgets page.** `BudgetsPage.jsx` has, from top to bottom:
  - a Categories panel for name, parent and the Budget/Tab `KindSwitch`;
  - a Monthly summary table whose every row carries a `LimitForm`
    ("this month only").
- **Overview page.** `OverviewPage.jsx` renders the tile's "outside
  budgets" line, using `ProgressBar` with a pace `marker`, and the
  attention items as `ListRow`s with tinted icons.
- **Shared UI.** `components/ui` has `Dialog`, `ProgressBar`,
  `MonthSwitcher` and `Table`. `useMediaQuery` already switches layouts
  on the overview.
- **Reviews.** A UX review and a UI review were done for this change.
  The decisions below include their recommendations as accepted by the
  user.

## Goals / Non-Goals

**Goals:**
- One module computes yearly figures, used by both the summary and the
  overview, the same way `summary.py` works for monthly figures.
- All date arithmetic (pro-rating, pace, reference day, due dates,
  tolerance) lives in pure functions that can be tested without the
  database.
- One budget editor for every kind, reachable from wherever a budget is
  shown.

**Non-Goals:**
- Changing how monthly limits are stored or computed.
- Caching. Two extra grouped queries per request are fine for one
  household.

## Decisions

### Kind on the category, amounts in a per-year table
- `Category.budget_kind` is a choice field: `monthly` (default), `yearly`
  or `target`. The migration sets existing rows to `monthly`.
- A new `YearlyBudget` model has `category`, `from_year`,
  `amount_cents`, `due_month` and `due_day`, with the due fields null
  for `yearly`. It is unique on `(category, from_year)`.
- The values for year Y come from the row with the largest
  `from_year <= Y`. If no row qualifies, the oldest row applies, so a
  budget always covers whole years and the month it was added never
  matters.
- Saving writes to `from_year = today.year` with `update_or_create`.
  This gives "applies to this year and later" and "one history line per
  year" without extra logic.
- **Switching between `yearly` and `target`** only changes `budget_kind`
  and writes the current year's row, with or without a due date. Older
  rows, and the due dates they hold, stay as they are.
- **Switching to or from `monthly`** deletes the other side's rows.

*Alternatives:*
- Deriving the kind from which rows exist makes switching kind and
  "yearly with no amount yet" awkward.
- One row per edit, with timestamps, would need collapsing before
  display, and nothing in the spec needs individual edits.

### Start month as a singleton row in `budgets`
- `BudgetSettings` has `start_month` (a nullable first-of-month date)
  and is read with `get_or_create(pk=1)`.
- It lives in `budgets` because only budgets read it.
- The API is `GET/PUT /api/budgets/settings/` with
  `{start_month: "YYYY-MM" | null}`.

*Alternative:* a general key-value settings table in `core`. That's
more than one setting needs. It can be moved there when a second
app-wide setting shows up.

### `budgets/yearly.py`: pure date helpers plus one query function
Pure functions, each taking dates, not models:
- `budgeted_period(year, start_month)`: `(first_day, last_day)` or
  `None`. The first day is the later of 1 January and the start month.
  The result is `None` before the start year.
- `prorated_cents(amount, year, start_month)`: `amount * months // 12`
  in the start year, using integer cents, so the result is rounded down.
- `target_counts(year, due, start_month)`.
- `reference_day(month, today)`: today when `month` is the current
  month, else the month's last day.
- `pace(period, today)`: days passed including today, divided by the
  days in the period.
- `runway_cents(left, today)`: left divided by the months remaining,
  the current month included.
- `tolerance_cents(amount)`: `max(amount * 5 // 100, 1000)`.
- `target_state(spent, amount, due_date, ref_day)` returns, in order:
  - `paid_over` when `spent > amount + tolerance`;
  - `paid` when spent is within the tolerance either way;
  - when nothing above applies and `ref_day <= due`: `due_soon` within
    `DUE_SOON_DAYS = 14`, else `upcoming`;
  - when `due < ref_day <= due + GRACE_DAYS` (7): `not_seen`;
  - after that, `overdue` with nothing spent, else `partly_paid`.

`yearly_rows(month, today)` runs the queries:
- It loads yearly and target categories (via `budgeted_categories()`)
  and their `YearlyBudget` rows.
- It sums spending with one grouped query over
  `[period_start, end of month)`, using the same base queryset as
  `budget_rows`.
- It returns one row per category with:
  - `kind`, `amount_cents` (the year's full amount), `budget_cents`
    (pro-rated) and `prorated_from` (the start month, only when
    pro-rated);
  - `spent_cents`, `remaining_cents`, `over` and `ahead`;
  - for targets: `due_date`, `state` and `difference_cents`;
  - for the current month: `pace` and `runway_cents`.
- It returns `{"starts": "YYYY-MM"}` instead of rows when the viewed
  month is before the start month.
- The row's `ahead` uses the same rule (at least 85% and ahead of pace)
  as the overview warning, so the Budgets page bar and Needs attention
  agree.

*Alternative:* adding this to `budget_rows`. Its rows are month-shaped,
and the overview's tile sums would then have to filter by kind
everywhere.

### `budget_rows` filters to monthly categories
- `budget_rows` keeps its row shape but only includes
  `budget_kind == "monthly"`. That covers the monthly summary, the
  tile's limit total, "outside budgets" and `_attention_categories` in
  one place.
- The summary and the overview both add `yearly_spent_cents`, the
  month's spending in yearly and target categories. The summary uses it
  for its footer line, and the overview for the tile line.
- The tile's no-limits total also adds `yearly_spent_cents`, so the
  month's spending stays complete.

### API shapes
- **Summary.** `GET /api/budgets/summary/?month=` gains
  `yearly_spent_cents` and
  `yearly: {year, through, start_month, starts?, categories: [...]}`.
  `through` is the reference day, used for the title "to 24 Oct".
- **Categories.** `GET /api/categories/` gains:
  - `budget_kind`;
  - the current yearly values;
  - `yearly_history`: `[{from_year, amount_cents, due}]`, newest first;
  - `monthly_limits`: `{default_cents, override_count}`.

  The editor uses these to decide whether to confirm and what to say.
- **Setting a budget.** `PUT /api/categories/{id}/budget/` takes
  `{kind, amount_cents?, due?: "MM-DD"}` and sets kind and amount in one
  transaction:
  - It follows the switching rules above.
  - It rejects tabs, 29 February, a target without a due date, and a
    missing yearly amount.
  - The existing `PUT .../limit/` stays for monthly amounts and rejects
    non-monthly categories.
- **Overview.** `attention` gains `yearly: [...]`. Each item has `id`,
  `name`, `parent_name`, `kind`, `state` or `share`, `due_date`, and
  the amounts the item's two lines need, already ordered as the spec
  says.

*Alternative:* switching kind with a PATCH on the category and setting
the amount separately. That leaves a yearly category without an amount
between the two calls.

### Budgets page layout
- **Order.** Monthly summary, then This year, then Categories. The
  figures come first, and the settings list, which keeps growing, goes
  last.
- **Columns.** Both tables use Category | Budget | Spent | Left |
  Status, with a shared `<colgroup>` (auto, w-28, w-28, w-28, w-48), so
  the amounts line up down the page. The monthly headers "Limit" and
  "Remaining" become "Budget" and "Left".
- **Monthly footer.** The monthly table ends with a muted row: "Yearly
  budgets · 580.00 this month · see This year". It sits next to
  Uncategorized.
- **Budget cell as the edit trigger.**
  - The cell shows the amount and a `Pencil` (h-3.5, `text-ink-muted`).
    The pencil shows on row hover and is always visible on touch.
  - The separate "Set limit" column goes away.
  - When pro-rated, the cell adds "of 1,200 · from Oct" underneath in
    `text-xs text-ink-muted`.
- **`BudgetEditor`, an expansion row.**
  - It is a `<tr>` with one `colSpan` cell (`bg-surface-2 px-5 py-3`),
    and only one is open at a time, following the Categories panel's
    `editingId` pattern.
  - Contents:
    - a "Budget" segmented control: Monthly · Yearly · On a date;
    - Monthly: an amount with "a month" and "This month only";
    - Yearly: an amount with "a year";
    - On a date: an amount, plus "due" with a day `Input` (w-16) and a
      month `Select`;
    - a scope line: "Applies to 2027 and later. 2026 stays €1,200." It
      is in warning tone when the viewed year isn't the current year;
    - a live pro-rating line: "2026: €300 (from Oct)".
  - On save, a row that changed table is briefly highlighted in its new
    panel, using the `review-return` keyframe.
  - *Alternative:* a dialog editor. The expansion row keeps the figures
    in view and follows an existing pattern.
- **Confirmation dialog.** Switching to or from Monthly, when there are
  amounts to drop, opens `Dialog`. Example text: "Switching Clothing to
  yearly removes the 100.00 monthly limit and 1 month override."
  Buttons: "Switch to yearly" and "Cancel". Nothing is saved before
  confirming.
- **Segmented control.** `KindSwitch`'s look (h-8, bordered, selected
  `bg-accent text-on-accent`) moves into `ui/SegmentedControl`. Both the
  Budget/Tab switch and the budget editor use it.
- **Status column.**
  - **Yearly budgets.** `ProgressBar` (`max-w-40`), with `marker={pace}`
    in the current month. Below it, "€40 a month to Dec" in
    `text-xs text-ink-muted`. When over, it says "€30 over for 2026" in
    `text-critical` and the bar turns critical. Past months show the
    bar without a marker.
  - `ProgressBar` gets `tone="warning"` (fill `bg-warning`), used when
    `ahead`.
  - **Targets** are shown as an icon plus text, not pills:

    | state | icon | text | colour |
    |---|---|---|---|
    | upcoming | CalendarClock | Due 1 Nov | ink-secondary |
    | due_soon | CalendarClock | Due 1 Nov, in 8 days (· €100 paid) | icon warning |
    | not_seen | AlertTriangle | Due 1 Nov, not seen yet | warning |
    | overdue | AlertTriangle | Overdue since 1 Nov | critical, medium |
    | partly_paid | AlertTriangle | Partly paid · €100 short | warning |
    | paid | CheckCircle2 | Paid (· €2 under) | icon positive |
    | paid_over | CheckCircle2 | Paid · €50 over | icon positive, "€50 over" warning |

- **This year header.**
  - The title is "This year (2026)", followed by "to 24 Oct" in muted
    text.
  - The actions slot holds one ghost button: a Calendar icon with "From
    Oct 2026", or "Set start month" when none is set. It opens an inline
    strip with `MonthSwitcher`, Save and Clear.
  - Before the start month, the panel shows an `EmptyState` with "Go to
    October 2026".
- **Phone (below 640px).** Both summaries render as stacked rows,
  chosen with `useMediaQuery("(min-width: 640px)")`:
  - line 1: the name, and "left" on the right;
  - line 2: "180.00 of 300.00", plus the pro-rating note;
  - line 3: the bar with the runway, or the target state.

  Tapping a row opens the editor below it, with its fields stacked.
- **History.**
  - The Categories row shows "Yearly · €1,200 a year" or "On a date ·
    €400 on 1 Nov" (and "Monthly · €400"), styled like "Tab group · not
    budgeted".
  - A "History" ghost button appears only with two or more lines, and
    expands an indented two-column list.

### Overview
- The tile's line puts "€580 on yearly budgets" first. Each piece is a
  `whitespace-nowrap` span inside a `flex flex-wrap` line, so it only
  breaks between pieces.
- Yearly attention items use the same `ListRow` as category items, with
  a second line such as "Yearly · €270 of €300" or "Due 1 Nov · €0 of
  €400".
- Icon colours:
  - over and overdue: critical;
  - ahead of pace, not seen yet, partly paid and paid over: warning;
  - due soon: a muted clock.

## Risks / Trade-offs

- **[Risk]** A target paid in instalments reads as due soon or partly
  paid until the total is within the tolerance. → This is intended, and
  the state shows how much is paid.
- **[Risk]** A late import makes a paid target look "not seen yet" for up
  to 7 days, and overdue after that. → The 7-day grace period covers the
  usual import lag. An import-aware check is out of scope, and the
  stale-import reminder points at the cause.
- **[Trade-off]** The tolerance (5%, at least 10.00) hides small
  differences from Needs attention. → They still show as a note in the
  Status column.
- **[Risk]** Changing the start month recalculates every yearly figure,
  including past years'. → That is the intent of a start month. Nothing
  is stored per year that could go stale.
- **[Trade-off]** Editing an amount in early January to correct the
  previous year isn't possible. It applies to the new year. → Accepted
  as the user's choice, and the editor's scope line says so.
- **[Risk]** Switching to or from monthly deletes amounts permanently.
  → A confirmation dialog names what will be removed.

## Migration Plan

- One migration in `budgets`:
  - adds `Category.budget_kind` with default `monthly`;
  - creates `YearlyBudget` and `BudgetSettings`.
- Existing data is unaffected: every category stays monthly, and no
  start month is set.
- Rollback is to reverse the migration. Yearly amounts are lost, and
  monthly limits are untouched.

# Design

## Context

The real budget lives in four places, each with its own history rules:

- `CategoryLimit`: one default row per monthly category (`month` null)
  plus per-month overrides. The default has **no history**: changing it
  rewrites every month, past ones included.
- `YearlyBudget`: rows per `from_year`, so a year uses the latest row at
  or before it.
- `Bill`: `from_month` / `until_month`, changed from a month on by
  `bill_changes.apply_bills`.
- `Category.budget_kind`: a single field. Switching kind deletes the other
  side's amounts (`CategoryViewSet.set_budget`).

Loan categories get their bills from schedules (`loan_bills`). Everything
that reads limits (month summary, Overview tile, attention, forecast)
goes through `summary.monthly_limits(month)`, which is the one place that
needs to learn about default history.

The month view's sheet (`BudgetSheet` / `BudgetEditor`) calls the
categories API directly.

## Goals / Non-Goals

**Goals:**
- One calculation of "a budget's figures for a year" that serves Current
  and drafts alike, so the two can't disagree and diffs are simple.
- Applying a draft reuses the existing write paths (set budget, bills from
  a month, yearly rows), so the rules already in the specs keep holding.
- The draft sheet reuses the month view's editor, not a second editor.

**Non-Goals:**
- Versioning `budget_kind`. A kind switch applies to the whole category
  (see specs, "Kind switches apply to the whole category").
- Storing Current as a copy. Current is always computed from the real
  budget.
- Editing the real budget from the Year view. Current is read-only there;
  a year changes only by applying a draft from a month, so there is one
  path with one preview, and no edit can rewrite earlier months by
  accident.
- Income budgets that track month by month.

## Decisions

### 1. Default limit history: `from_month` on `CategoryLimit`

Add a nullable `from_month` to `CategoryLimit`. Default rows (`month` null)
may have a `from_month`; null means "from the start". A month uses its
override, else the default with the largest `from_month <= month`, else the
null-`from_month` default, else none: a default applied from a month
doesn't reach back before it. Constraints: one
`(category)` default with null `from_month`, and one `(category,
from_month)` default otherwise (two partial unique constraints, the same
NULL-distinct pattern the model already uses).

`set_limit` without `month` takes an optional `in_effect` month (the
viewed month, defaulting to today's) and updates the default row in
effect there, which gives the spec's "Editing the default edits the one in
effect" behaviour. Remove-budget and kind switches already delete
`category.limits.all()`, which covers every period.

*Alternative:* write per-month overrides for every applied month. That's
rejected: it would flood the month view with "this month only" markers and
break "Use default".

### 2. Plan storage: relational rows, Current not stored

```
YearPlan (HouseholdOwned)
  year, name, kind: current | draft | applied
  from_month (1-12), copied_at, applied_at, applied_from_month
  -- a "current" row exists only to hold Current's income lines
PlanBudget (plan, category)        -- drafts / applied only
  kind: monthly | yearly | target | bills | none
  default_cents, month_cents {month: cents}   -- monthly
  amount_cents, due_month, due_day             -- yearly kinds
  base {...}   -- Current's values for this category when copied
PlanBill (plan_budget)  name, day, amount_cents, from_month (1-12),
                        until_month (1-12, null = keeps going)
IncomeLine (plan)       name, category?, amount_cents, per: month|year,
                        extra {month: cents}
```

An applied draft keeps its rows and changes `kind` to `applied`, which
makes it read-only. A draft holds a `PlanBudget` for every budgeted
category plus the ones the user touched, so a category budgeted after
copying shows up as "changed since copied" rather than silently joining
the draft. Loan categories are never stored; they always read from the
schedules.

*Alternative:* one JSON document per plan. It's simpler to copy, but
diffs, constraints and backups get harder, and it doesn't match the rest
of the codebase.

### 3. One year model: `YearBudget` per category

A pure module (`budgets/plans.py`) turns any source into the same shape
per category: `kind`, twelve monthly amounts (or None) for monthly and
Bills, or `amount` / `due` for the yearly kinds, plus `locked` for loans.

- **Current**: built from the real budget by asking `monthly_limits` for
  each of the twelve months, plus `yearly.values_for_year` and the start
  month rules (pro-rating, target counting).
- **Draft**: the draft's `PlanBudget` for months from its from month,
  Current's values for earlier months. When the kind differs from
  Current's, the draft's kind holds for the whole year, matching what Apply
  does.

The year total, the totals' cap rule (parent counts, its caps don't) and
"vs current" all work on this shape. "Changed since copied" compares
`base` with Current's shape now. Tests pin Current's year total to the sum
of the month view's limits.

### 4. Actuals

`spent_by_category` over a date range: the last 12 complete months for a
future year, 1 January to today for the current year, and the whole year
for a past year. Income lines use the net inflow of their category and
its subcategories. "Heading for" = actual so far + the plan for the months
after the current one, per row and in total. Uncategorized money and
categories outside the plan come from the same range.

### 5. Apply = existing write paths, in one transaction

For each category in the draft, from month `F` of year `Y`:

1. Kind differs: switch kind as `set_budget` does (deleting the other
   side's amounts).
2. Monthly: write a default with `from_month = F` (or update one that
   starts at `F`). Delete defaults starting after `F` within `Y`, and keep
   those after `Y`. Replace overrides in `F..Dec Y` with the draft's
   exceptions.
3. Bills: `apply_bills` generalised to "make these the bills from `F`",
   with each draft bill's own from/until months inside `Y`. A bill that
   keeps going stays open-ended; one that ends in December gets
   `until_month = Dec Y`.
4. Yearly kinds: `YearlyBudget` row for `from_year = Y`.
5. `none`: remove the budget, as `remove_budget`.

Then replace the `current` plan's income lines for `Y` with the draft's
and stamp the draft as applied. The whole apply runs in one transaction,
so a refusal changes nothing. The preview runs steps 1–5 as a dry run
that returns the change list, so the preview and the apply can't drift
apart.

### 6. API

```
GET    /api/budgets/plans/?year=Y            chips: current, drafts, history
GET    /api/budgets/plans/<id|current>/?year=Y   rows, totals, actual range
POST   /api/budgets/plans/                   {year, name, copy_of, from_month}
PATCH  /api/budgets/plans/<id>/              name, from_month
DELETE /api/budgets/plans/<id>/
POST   /api/budgets/plans/<id>/duplicate/
PUT    /api/budgets/plans/<id>/categories/<cat>/budget/   kind, amounts, months
PUT    /api/budgets/plans/<id>/categories/<cat>/bills/
DELETE /api/budgets/plans/<id>/categories/<cat>/budget/
POST/PATCH/DELETE /api/budgets/plans/<id|current>/income/...
GET    /api/budgets/plans/<id>/apply/?from=YYYY-MM     preview
POST   /api/budgets/plans/<id>/apply/        {from_month}
```

Current's budget rows have no write endpoints (read-only in the Year
view), and only its income lines are writable. "Change in a new draft" is
a create with `copy_of: current` plus the category to open. Applied plans
reject every write. A draft's values for months before its from month are
kept in `month_cents` and ignored by the calculation, so moving the from
month back restores them.

Income suggestions: expected income items first. Then each top-level
category with a net inflow over the last 12 complete months, unless an
expected item is recognised by that category or one of its subcategories,
so Add all can't count the same money twice.

### 7. Frontend: a draft editor beside the month editor

The month view's `BudgetEditor` is built around one viewed month ("This
month only", Use default with Undo, bills from the viewed month on), so a
draft gets its own `PlanBudgetEditor` instead of a mode on it. It uses the
same controls (the kind `SegmentedControl`, amount and due fields), adds
the twelve-month grid and bills with from/until months, and writes to the
plan endpoints. `PlanSheet` holds it for a draft. For Current and applied
plans it is read-only, with the year's months, "Change in a new draft" and
"Open in month view". A draft sheet shows "Editing draft <name>" in
`text-draft-ink` above the title, and Save to draft. The month view's
editor and sheet are unchanged.

*Alternative:* a `target` prop on `BudgetEditor`. Rejected once built: every
month-view branch would need a draft counterpart, putting the month view at
risk for no shared behaviour.

- **Switches:** Month | Year is a `PillSwitch` in the `PageHeader`, as on
  Forecast (`SegmentedControl` is for form choices). `MonthSwitcher` is
  generalised into one stepper (label, prev, next, `max`) used for months
  and years, so both look the same.
- **Chips:** a new `PlanChip` (`h-8 rounded-full px-3 ring-1 ring-border`;
  selected `bg-ink-primary text-surface`). Draft chips get a small
  `bg-draft` dot; the menu opens from the selected chip; the row ends with
  ghost `+ New draft` and `History`, and scrolls with `-mx-4 px-4` on
  phones.
- **Headline:** one `Panel`. "Left to save" is the big figure, with its
  share of income, a stacked h-2 bar (expenses in `--chart-series-2`,
  saved in `--positive`, a `--critical` tail when short) and a muted line
  with expenses and actual. In drafts, the difference with Current is a
  `StatusBadge`. "Heading for" is a `marker` on the bar plus one line.
- **Rows:** BudgetRow's grid, widened on `lg` to
  `name | bar | Plan | Change | Actual` with right-aligned `num` columns
  and SpendingTable-style section labels (INCOME, EXPENSES, NOT IN THE
  PLAN). Current's struck value sits `text-xs line-through text-ink-muted`
  above the plan figure. Change is blank at zero, `text-positive` for
  savings and `text-critical` for increases. The changed dot is `bg-draft`.
  "Budget changed since copy" goes in the caption with `AlertTriangle` and
  "Use <value>". Loan rows get `Landmark` and secondary ink. The So far /
  Still to come bar reuses BillBar's language: solid accent for actual,
  `accent/30` for the remaining plan.
- **Income:** its own Panel above Expenses, amounts in `text-positive`, a
  neutral "Plan only" badge on Current, and suggestions as an `EmptyState`
  of `ListRow`s with `+ Add`, plus Add all in the panel actions.
- **Draft surface:** new tokens in `index.css`, a blue apart from the teal
  accent and amber warning:
  ```
  :root  --draft:#3b6fb6; --draft-tint:#eceff5; --draft-bar:#e2e8f3;
         --draft-ring:rgba(59,111,182,.28); --draft-ink:#2c5590;
  .dark  --draft:#6b9be0; --draft-tint:#10131a; --draft-bar:#172131;
         --draft-ring:rgba(107,155,224,.30); --draft-ink:#9dbdeb;
  ```
  The page behind the panels is tinted; the panels stay `bg-surface` with
  `ring-draft-ring`. The draft bar is a `bg-draft-bar` strip with the name,
  a compact From `Select` and the primary Apply. It is `sticky top-0` on
  desktop, and at the bottom above the tab bar on phones, where the toast
  viewport moves up by the bar's height while a draft is open. Applied
  plans render at `opacity-80` with a neutral stamp badge and only
  Duplicate.
- **Month exceptions:** collapsed behind "Different amount in some
  months". Opened, they are a `grid-cols-4` grid of twelve cells (month
  label above an input whose placeholder is the default). Exception cells
  get `ring-draft-ring bg-draft-tint` and a reset; cells before the from
  month are read-only on `bg-surface-2`, captioned "Real budget".
- **Apply dialog:** `Dialog sm:max-w-md`, with the part-spent warning on
  top, kind switches first in `text-warning` with a muted line saying what
  goes, then name / `650 -> 600 a month` rows. Changed-since-copy items go
  in a `bg-surface-2` block like the sheet's "To review". The button reads
  "Apply from <Month>".
- **Address:** `view=year&year=Y&plan=<id>`.

## Risks / Trade-offs

- [A kind switch applied mid-year removes earlier months' limits] →
  the preview spells it out per category. This is the existing kind switch
  behaviour, and versioning kinds isn't worth its cost here.
- [Drafts go stale as the real budget changes] → the `base` snapshot flags
  rows, and the preview lists them. There's no merge logic.
- [Year figures drift from the month view] → Current is built from
  `monthly_limits`, and a test asserts parity for monthly, Bills, loans and
  caps.
- [The draft bar and toasts collide on phones] → the toast viewport
  offset grows while a draft is open.
- [`BudgetEditor` refactor breaks the month view] → land the `target`
  refactor first, with the existing BudgetSheet tests unchanged and green,
  before any draft behaviour.
- [Twelve `monthly_limits` calls per Current view] → a few queries each.
  This is fine at household scale; batch it only if it shows up as slow.

## Migration Plan

One additive migration: `CategoryLimit.from_month` (null) and the plan
tables. Existing defaults get null and keep behaving as "every month". The
backup format adds the new models, and older backups restore without them.
Rolling back means dropping the tables and the column. That's only safe
before any plan is applied from a month, since a second default row would
otherwise be lost.

## Open Questions

- The draft tokens above may be tuned when the Year view is reviewed in
  the running app (task 6.1). That changes colours only, not the approach.

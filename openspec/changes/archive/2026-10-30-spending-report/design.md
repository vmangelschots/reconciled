# Design

## Context

See proposal.md for motivation and the specs for behaviour.
`reports/spending.py` has `active_transactions()` and `month_spending()`,
which work one month at a time for active accounts. The Transactions page
can't serve the drill-down: it needs one account, keeps filters in local
state, matches a category exactly so parents miss subcategories, has no
uncategorized filter, and returns a split at its full amount. Recharts,
`Table`, `Dialog` and `CategoryCombobox` already exist.

## Goals / Non-Goals

**Goals:**
- Every figure on the page comes from one rule, so a cell always equals
  the sheet that opens from it.
- The Overview's month figures stay as they are.

**Non-Goals:**
- Budget vs actual, top payees, or a report per account.
- Changing the pie's colours or moving it off its by-rank rule.
- An "All" period: 60 columns is not a usable table.
- Recategorising split parts in the sheet; those rows link to the ledger,
  filtered to their month.

## Decisions

**One report endpoint.** `GET /api/reports/spending/?start=YYYY-MM&end=YYYY-MM`
returns `start`, `end` (clipped to the data), `current_month`,
`full_months`, `categories`, `uncategorized` and `months` with in, out and
spending. The page has one error state, and the chart and table can't
disagree. Rejected: calling `month_spending` per month, at two queries per
month.

**The endpoint groups by month and category in one query.**
`active_transactions()` becomes `counted_transactions(include_archived=False)`
with the old name kept as its default use, so the Overview's rules can't
drift from the report's. `CashFlowView` goes, along with `getCashFlow`.
Its figures move into this response.

**Drill-down shares the filter.**
`GET /api/reports/spending/transactions/?month=YYYY-MM&category=<id>`, with
`category=uncategorized`, `direct=1` or `income=1`, is built on the same
queryset, so parents include subcategories and uncategorized rows go by
direction. `income=1` turns the figure's sign and the order round.
Rejected: extending the ledger API, which would mix report rules into
what must stay the bank's lines.

**Income is told apart by the period's total.** Categories have no income
flag, so a top-level category with a net inflow over the period is income;
the rest is spending. Rows then add up: Total income (income categories plus
uncategorized inflows) minus Total expenses is Net. It differs from Money in
by refunds, which reduce their expense category. A category whose refunds
beat its spending moves to Income for that period, and its section can
change with the period. Rejected: an income flag, which needs a migration
and setup; it can follow if a category is misjudged. Rejected: Money in as
income, which would make income minus expenses differ from Net by every
refund.

**Colours go by rank over the period, in a new order.** Ranks 1-6 use
`--chart-cat-1, 3, 4, 5, 2, 6`, because adjacent orange and rose in the
pie's order are too close when stacked. A category can differ in colour
from the pie, and a different period can repaint it; the legend names it
in both. Rejected: a stored colour per category, which needs a migration
and only six slots exist.

**Negative segments use `stackOffset="sign"`.** A net-refund month draws
below zero, so the chart agrees with the table. This replaces the earlier
idea of counting it as zero, which would have left the two disagreeing.

**Table is one component with two column orders.** `SpendingTable` takes
the months and reverses them below 1024px, with Total and Avg first.
It has a sticky first column and header, section rows and totals in the
body, and a `tfoot` for Net and Savings rate. Heat tinting is left out because it competes with the
swatches.

**Compact table styling.** Default `Table` sizing needs about 1130px for
12 months against a 1088px page, so: `text-[13px]`, `px-2.5`, outer cells
`px-5`; parents `h-9 font-medium` with a swatch when charted; subcategories
`h-8 text-ink-secondary` with no dividers between them. Total and Avg are
`bg-surface-2/60`, Total `font-medium` with `border-l` (`border-r` on Avg
below 1024px), Avg `text-ink-secondary`, its header `whitespace-nowrap
min-w-20`. Sticky cells take `group-hover:bg-surface-2`, and `tfoot` sticky
cells solid `bg-surface-2`, so hover and tint don't stop short. The name
column is capped at `w-32` on phones, with "Income after refunds" wrapping.
January headers carry the year. Net is `text-positive` when positive,
otherwise normal ink. When the table still overflows on a wide screen,
below about 1280px or with 24 months, it scrolls to the end on load and on
period change, so Total and Avg show first.

**Chart marks.** Largest category at the bottom, Other then Uncategorized
on top, 2px `--surface` gap, 4px radius on the top segment only through a
custom `shape`, dimming to 0.45. Hatched swatches stay SVG, as in the pie's
`LegendRow`.

**Header block.** `PageHeader` has no subtitle slot and the page's `gap-6`
would float these lines, so the header, caption (`text-xs text-ink-muted`),
summary (`text-sm font-medium`) and warning sit in one `gap-1` block. The
picker uses the text variant of the pill from `balance-history`. Custom adds
`From` and `To` selects at `h-8`, wrapping below it.

**Period state lives in the URL.** `?period=12m|year|last-year`, or
`?from=YYYY-MM&to=YYYY-MM`, read in `lib/reportPeriod.js`, which also
computes the presets in the browser's local time.

**The sheet is a restyled `DialogContent`**, as the More menu is. Inline
changes use the existing transaction update, then bump a counter in the
`useReport` key. `useReport` already keeps old data while loading, so the
page dims rather than blanks. A save also refreshes the Review count the
way the Review page does.

**Touch is detected by width, as the rest of the app does.** Below 1024px
a chart segment only shows its tooltip, because a tap would otherwise open
the sheet before the tooltip could be read.

**Ledger links use query params.** The sheet links to
`/transactions/<id>?from=YYYY-MM-DD&to=YYYY-MM-DD`. `TransactionsPage`
seeds its `filters` state from them; the API already has `date_from` and
`date_to`. Filters stay local after that. This is the only route to fixing
a split from the report, so opening the full history wouldn't do.

**No summary tiles.** The summary is a line of text under the caption.
The page keeps a ledger feel, and the headline still shows without
scrolling past a tall table.

## Risks / Trade-offs

- Archived accounts make a past month's report differ from the Overview's
  chart for that month → accepted: the report is the complete figure.
- A parent and subcategory row can both be negative or cancel out, so
  rank by total can look odd → ranking uses the parent's total only.
- Selecting a legend item rebases the chart while the table doesn't change
  → intended, since the table keeps the context.
- Removing In vs out from the Overview takes away a chart the user may
  check often → Reports is one click away, and the Overview keeps this
  month's change.

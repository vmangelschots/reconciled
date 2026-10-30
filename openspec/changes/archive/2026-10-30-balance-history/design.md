# Design

## Context

See proposal.md for motivation and the specs for behaviour. No balance
history is stored: `Account.current_balance_cents` is the starting balance
plus `ledger_rows()`, and the starting balance has no date. Value
adjustments are ordinary ledger rows whose amounts are kept right by
`transactions/adjustments.py`, so summing rows up to a date already gives
that date's value. The overview endpoint calls `sync_loans(today)` before
reading loan balances. `generate_forecast` works per account.

## Goals / Non-Goals

**Goals:**
- One balance computation behind both charts and the tile's change.
- New charts that the follow-up migration of `ForecastChart` can reuse.

**Non-Goals:**
- Storing balance snapshots.
- An archive date. Archived accounts count for all of history, or the
  tile and the charts would need a date the model doesn't have.
- Migrating `ForecastChart` off its hand-drawn SVG; only its look is
  matched here.
- Holding a valued account's first value backwards: the user wants real
  jumps, since a purchase is offset by a loan or by money leaving.

## Decisions

**Compute series in Python from one grouped query.** A new
`reports/balances.py` loads `ledger_rows()` grouped by account and date,
then accumulates per account and sums into tiers. One query over a
household's rows is cheap. Rejected: a stored snapshot table, which would
need invalidating whenever a backdated row or adjustment changes.

**Two endpoints, because the charts change at different times.**
`GET /api/reports/everyday-balance/?month=YYYY-MM` returns `points`,
`projection`, `lowest` and `has_scheduled`.
`GET /api/reports/net-worth/` returns `months` with `total_cents` and
`tiers`, and is loaded once; the month switcher only moves its marker.
Each panel keeps its own loading and error through `useReport`. Both call
`sync_loans(today)` first.

**Which accounts are the Everyday series.** Everyday-tier accounts,
archived ones included. With one tier in use the chart covers that tier,
matching the tile's "Balance" headline. The projection uses active
accounts only, since an archived account has no future.

**Project by summing `generate_forecast`.** Sum each active Everyday
account's points by date, shifted so the projection starts from the
history's value today. The shift matters because
`current_balance_cents` also counts rows dated in the future.

**Forecast fixes live in `forecasting/utils.py`.** Occurrences are
expanded from tomorrow. A new loop adds, for each `Loan` with
`paid_from=account`, an occurrence per future installment at
`-payment_cents`. Installments are skipped when a recurring transaction
on the account has the loan's `payment_category` or
`amount_cents == -payment_cents`. Matching on the recurring transaction
as a whole, rather than date by date, keeps the rule simple, because a
loan payment's recurring date rarely lands exactly on the installment.

**Net worth change comes from history, not from tiles.**
`OverviewView` adds `net_worth_change_cents` (null without an earlier
month end) from the same helper. It therefore counts archived accounts:
the tile's figure doesn't, but an account closed at zero makes no
difference to either.

**Charts use Recharts, in one shared shell.** `BalanceLine` wraps
`ComposedChart`: `type="linear"` for history and `type="stepAfter"` for
the projection, because a balance changes on a day, not between days. Both
series share today's point so they join. The tooltip chrome is extracted
from `InOutTooltip`. The Everyday chart forces zero into its domain,
whereas net worth uses `auto` with padding so one property step doesn't
flatten the line. The Everyday domain also spans the projection. Below
zero the projection is drawn in `--critical`, through a gradient on the
line with a hard stop at zero. New token: `--chart-area`,
`color-mix(in srgb, var(--chart-series-1) 8%, transparent)`, 12% in dark.
Tooltips show whole euros, so the shared chrome takes a formatter;
copying `InOutTooltip` as it stands would bring cents.

**Text on the charts.** Today gets a `chart-end-dot` and a
`chart-end-label` anchored `textAnchor="end"`. "To 30 Sep", the stale note
and the Forecast link use the caption style above the chart, with the
stale note in `text-warning`. The Overview's stale-import wording moves
to `lib/importFreshness.js`, so both say the same.

**Net worth sizing in the side column.** The chart is 195-312px wide
there: height 200, Y width 44, at most 4 X ticks, an end dot and label.
The chosen month gets a hollow dot (`r=4`, `--surface` fill, 2px
`--chart-series-1` stroke), and none when outside the range. The tooltip
uses `allowEscapeViewBox={{ x: true }}` and `reverseDirection={{ x: true }}`
to open leftward over the main column.

**Tile line.** The change is `num text-xs`, right-aligned under the
figure.

**Reuse the chart view pill.** `ChartViewSwitch` moves to
`components/ui/` with a text variant, for 1Y / 5Y / All. `SegmentedControl`
is too loud here.

**Net worth renders in one of two places.** The side column comes first
in the DOM for the phone order, but net worth must end up after recent
transactions on a phone. `useMediaQuery("(min-width: 1024px)")` picks the
column, and only one is mounted.

## Risks / Trade-offs

- The net worth tooltip's escape props are untested in this layout, and a
  Panel's overflow could clip them → task 3.3 proves this first; if they
  fail, the tooltip goes to a fixed line above the chart.
- The critical colour on a negative projection is a deliberate exception
  to "debt is not an alarm", which covers loans and net worth, not
  everyday money running out.

- A bill due today that isn't imported yet is missing from the projection
  → accepted: double-counting imported rent is the worse error, and the
  stale-import note covers the common cause.
- The recurring match can hide a real installment if an unrelated
  recurring transaction has the same amount → accepted as rare.
- A recurring transfer between two Everyday accounts defined on one side
  only skews the total → the user can define both legs.
- An archived account with money left makes the charts end above or below
  the tiles → accepted; closed accounts are normally at zero.
- Backdating a first value or dating it on the payment day is what keeps
  the net worth line honest → a real jump is shown either way, by choice.

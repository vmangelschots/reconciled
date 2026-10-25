# Design

## Context

The panel renders `CategorySpendingChart`. That component holds the bars
and the optional table, and its `buildRows` turns the API payload into
top-level rows, each carrying its child rows. `OverviewPage` owns the
table toggle through the controlled `showTable` prop. The page's other
chart, `InOutChart`, uses Recharts with animation off and a
fixed-width path for tests, since jsdom can't measure layout. Only
`--chart-series-1` (the accent) and `--chart-series-2` exist as chart
colours. The visual direction below comes from a UI design review done
for this change.

## Goals / Non-Goals

**Goals:**
- One row model shared by bars, pie and table, so the views never
  disagree on figures.
- A pie that reads well at 180px on a phone and in light and dark mode.

**Non-Goals:**
- Sharing the drill state between the bars and pie views. Each keeps its
  own, and both reset when the month changes.

## Decisions

### Donut with a centre readout, not a floating tooltip
The donut uses Recharts `Pie` with `innerRadius="62%"`, `paddingAngle`
1.5, `cornerRadius` 3, and a `--surface` stroke between slices. It is
200px wide on wide screens and 180px on phones. The centre shows "Spent"
and the total. Hovering, focusing or tapping a slice or legend row
replaces that with the slice's name, amount and share, so there is no
tooltip box to position on a phone. The active slice grows by 6px through
`activeShape`, and the others fade to 0.45 over 150ms.
*Alternatives:* a full pie gives the centre total nowhere to go. The
Recharts `Tooltip` overlaps slices and gets clipped at 390px.

### Legend list instead of slice labels
Each row shows a swatch, the name (truncated), the amount in
`tabular-nums`, and the share in muted text. Rows use `py-1.5 text-sm`,
the same rhythm as the bars. Wide screens use
`sm:grid-cols-[200px_1fr]`, with the donut left and the legend right. On
a phone the donut sits centred above the legend. Hovering a row
highlights its slice and the other way round. Rows that can drill in
show a `ChevronRight`.
*Alternative:* labels on the slices collide on small slices and at phone
width.

### Pie rows derived from the shared rows
`buildRows` moves to a small module that both views import. A
`buildPieSlices(rows)` step:
1. takes the categorised rows largest first;
2. keeps the top six;
3. folds the rest into "Other" only if two or more remain, with the
   members kept as Other's children;
4. adds "Uncategorized" last as its own slice.

Drilling in renders the selected slice's children through the same
component. A parent's children are its subcategories plus
"<Parent> (direct)", as the bars show them. Other's children are the
grouped categories.

### Colour by rank with new tokens
`index.css` gets `--chart-cat-1`…`--chart-cat-6` and `--chart-other`,
defined for light and dark:

| token | light | dark |
|---|---|---|
| cat-1 | `var(--accent)` (#0f766e) | `var(--accent)` (#26b5a5) |
| cat-2 | #3b6fb6 | #6b9be0 |
| cat-3 | #c08a1e | #e0aa45 |
| cat-4 | #8a5cb8 | #a985d6 |
| cat-5 | #c4623d | #e07f58 |
| cat-6 | #b5577f | #d47aa0 |
| other | `var(--chart-series-2)` | `var(--chart-series-2)` |

The colours are muted to suit the warm background and stay clear of
`--positive` and `--critical`. Colour goes by rank, so the largest
category is always the accent.
- **Uncategorized** gets an SVG `<pattern>` of 45° `--chart-series-2`
  stripes over `--surface-2`, with a matching legend swatch.
- **Drilled-in children** use their parent's colour stepped by opacity:
  1, .78, .6, .45, .34, then .28 for the rest. Drilling into Other uses
  `--chart-other` stepped the same way.

### The switch lives in OverviewPage and is remembered there
A segmented control in the panel `actions`, before `TableToggle`:
- a track of `inline-flex rounded-lg bg-surface-2 p-0.5`;
- two `h-7 w-8` icon buttons, `ChartBarDecreasing` for bars and
  `ChartPie` for the pie;
- the active button `bg-surface shadow-sm text-ink-primary`.

`OverviewPage` reads and writes the `reconciled-category-chart` key
(`"bars"` | `"pie"`) in localStorage, inside try/catch as
`ThemeProvider` does, falling back to bars. The key follows the
`reconciled-theme` naming. Below `sm`, "Show as table" may shorten to
"Table" if the header would wrap.
*Alternative:* putting the switch inside `CategorySpendingChart` would
split the header controls between two owners, while `OverviewPage`
already owns the table toggle.

### Animation
The pie sweeps in once (400ms ease-out) when it appears and on each
drill in or out. Changing view swaps instantly. Tests turn animation off
through a prop, like `InOutChart`'s fixed width.

## Risks / Trade-offs

- [Recharts pie interactions are hard to drive in jsdom] → Drive
  drilling and highlighting from the legend rows, which are plain
  buttons, in tests. Slices and rows share one handler.
- [Seven distinguishable colours are close to the limit] → Grouping into
  "Other" caps the top level at six colours plus grey plus hatching.
  Drilled views reuse a single hue.
- [localStorage can throw in private windows] → try/catch with the bars
  default, as `ThemeProvider` does.

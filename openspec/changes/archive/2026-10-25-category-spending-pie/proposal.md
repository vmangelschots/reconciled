# Proposal

Issue: #17

## Why

"Spending by category" on the overview only shows horizontal bars. Bars
compare amounts well, but they don't show at a glance how the month's
spending divides up: what share went to groceries, and how much of the
whole the top few categories take. A donut shows exactly that, and it's
what the user asked for alongside the bars.

## What Changes

- **A bars/pie switch in the panel header:** a small two-icon segmented
  control, to the left of "Show as table". Bars stay the default. The
  choice is remembered in this browser, and "Show as table" keeps working
  under either view.
- **A donut view of the month's spending:**
  - The centre shows the month's total. Hovering or tapping a slice or a
    legend row shows that category's name, amount and share there
    instead.
  - The legend lists each slice with its swatch, name, amount and share.
    It sits beside the donut on wide screens and below it on a phone.
  - The six largest categories get their own colour, by rank. Smaller ones
    are grouped into "Other" when there are at least two of them.
  - "Uncategorized" is never grouped into "Other". It gets a hatched
    slice of its own.
- **Drilling into a parent:** clicking a parent's slice or legend row
  shows its subcategories, plus "<Parent> (direct)", as their own donut.
  "Other" drills into its member categories the same way. "← All
  categories" goes back. This mirrors expanding a bar.
- **New chart colour tokens** for light and dark mode, starting from the
  accent.

Not in scope:
- A pie for the "In vs out" chart, or for any other page.
- Remembering the choice across devices (it isn't stored on the server).
- Changing the bars view or the table itself.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `dashboard`: the expenses per category chart can be shown as bars or as
  a donut, with grouping into "Other", drilling into a parent, and a
  remembered choice.

## Impact

- **Frontend:**
  - A new `CategorySpendingPie` component, built with Recharts, which is
    already a dependency.
  - `CategorySpendingChart.jsx` shares its row building with the pie.
  - `OverviewPage.jsx` gets the view switch in the panel actions and the
    remembered choice.
  - `index.css` gets the category colour tokens.
  - Tests for the new component and for the overview switch.
- No backend or API change, and no new dependencies.

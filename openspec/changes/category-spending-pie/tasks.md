# Tasks

## 1. Shared rows and pie slices

- [x] 1.1 Move `buildRows` out of `CategorySpendingChart.jsx` into `lib/categorySpending.js` and add `buildPieSlices(rows)`. It keeps the top six categorised rows, folds the rest into "Other" (with the members as children) only when two or more remain, and appends "Uncategorized" last. Verify with `categorySpending.test.js` cases for "Tail grouped into Other", "Exactly seven categories", a single leftover keeping its own slice, and Uncategorized never folding, with the existing `CategorySpendingChart.test.jsx` still passing.

## 2. Donut component

- [x] 2.1 Add `--chart-cat-1`…`--chart-cat-6` and `--chart-other` to `index.css` for light and dark, as in design.md. Build `CategorySpendingPie`:
  - a Recharts donut with the centre total ("Spent" plus the amount);
  - a legend of swatch, name, amount and share;
  - colour by rank, hatched Uncategorized, and the wide/phone layout;
  - the "No spending in {month}." empty state;
  - an animation prop that tests turn off, plus a fixed width for tests, as `InOutChart` does.

  Verify with `CategorySpendingPie.test.jsx` cases for "Centre total", "Legend shows shares" and "Empty month".
- [x] 2.2 Add the highlight and drilling:
  - hovering or focusing a legend row or slice highlights the slice and shows its name, amount and share in the centre;
  - selecting a parent or "Other" drills into its children (parent colour stepped by opacity), with "← All categories" to go back;
  - rows that can't drill aren't buttons.

  Verify with tests for "Hover a slice" (through the legend row), "Drill into a parent", "Back to all categories", "Drill into Other" and "Categories without subcategories are not drillable".

## 3. Switch on the overview

- [ ] 3.1 In `OverviewPage`, add the segmented bars/pie switch before `TableToggle` in the panel actions (icons `ChartBarDecreasing` and `ChartPie`, active state as in design.md). Remember the choice in localStorage under `reconciled-category-chart` inside try/catch, default to bars, and render `CategorySpendingPie` or `CategorySpendingChart` with the same table toggle. Verify with `OverviewPage` tests for "Switch to the pie", "The choice is remembered", "First visit", "Table under the pie" and "Move to the previous month" resetting a drill.

## 4. Check

- [ ] 4.1 In the local stack, with a month of at least nine categories, some subcategories and some uncategorized spending, check the switch, the donut, the legend, Other, hatching, hover, drilling in and back, the table under the pie, and the remembered choice after a reload. Do this in light and dark mode at full width and at 390px. Verify that frontend `npm test`, `npm run lint` and `npm run build` pass.

## Workflow follow-up

- Open a GitHub issue for this change on the Reconciled project and reference it in proposal.md.
- Archive the change on its branch, then open the PR with `Fixes #N`.

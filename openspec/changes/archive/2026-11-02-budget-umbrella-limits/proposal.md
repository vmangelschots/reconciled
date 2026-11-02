# Proposal

Issue: #45

## Why

Households read a parent category's budget as an umbrella: Food has 1,000.00
a month for everything under it, and Restaurant has an extra cap of 100.00
inside that. The app treats every limit as an independent pot, so Food only
counts spending booked directly on it, and the Overview budget tile adds the
limits together and reports a 1,100.00 budget. This has to be right first,
because the Budgets page redesign is built on these numbers.

## What Changes

- **BREAKING** A parent's budget covers everything under it: its own
  spending plus that of all its subcategories, whatever their budget kind.
  This reverses the rule that a parent's figures are never a sum of its
  subcategories' figures.
- A subcategory's budget becomes a cap inside its parent: it keeps its own
  figures and warnings, but adds nothing to the budget total when its parent
  has a budget.
- A subcategory without a limit under a parent with a budget no longer counts
  as outside budgets.
- A parent without a budget stays a plain group: its subcategories' budgets
  count on their own.
- Each euro counts once across the budget total, outside budgets and the
  yearly spending line: spending counts with the budget of the parent that
  covers it. A yearly subcategory's spending under a monthly parent moves
  into the budget total, and a monthly subcategory's spending under a yearly
  parent moves to the yearly line.
- The same rule applies to yearly and yearly-on-a-date parents.
- The Budgets page says when a parent includes its subcategories, shows
  subcategories without a limit as covered by it, and notes when caps add up
  to more than the parent's limit. Exceeding it remains allowed.
- A monthly subcategory under a yearly parent, which is left out of the
  monthly summary today, is listed.
- Figures are calculated when viewed, so past months change too. No stored
  data changes.

Not in this change: the Budgets page redesign, the sheet editor and the
`/categories` page, which follow as `budget-overview-redesign`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `budgets`: parents cover their subcategories, subcategory limits are caps,
  and the monthly summary and its yearly line follow from that.
- `yearly-budgets`: yearly and yearly-on-a-date parents cover their
  subcategories.
- `overview`: the budget tile's total, outside-budgets and yearly figures
  count each euro once under the new rule.

## Impact

- `backend/budgets/summary.py`, `backend/budgets/yearly.py`: the rollup, and
  one shared definition of the month's totals.
- `backend/budgets/views.py`, `backend/reports/views.py`: use the shared
  totals. Summary rows gain fields; existing fields keep their names.
- `frontend/src/pages/BudgetsPage.jsx`, `frontend/src/lib/categoryTree.js`:
  labels and listing.
- Backend budget and overview tests that assert independent figures.
- No migration. Households with limits on both a parent and its subcategories
  see a lower budget total and may see new warnings, including in past months.

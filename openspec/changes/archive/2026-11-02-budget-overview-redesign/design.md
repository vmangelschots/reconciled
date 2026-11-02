# Design

## Context

See proposal.md for motivation. `BudgetsPage.jsx` holds the page, category
management and two table layouts. The Overview's headline figures now come
from `budget_totals`, but its pace and warnings are built in
`backend/reports/views.py`. `SpendingSheet` already pairs a side or bottom
Dialog with transaction rows and category fixes. `getSpendingCell` is by month,
and a parent's cell includes its subcategories.

The layout follows the exploration with the UX and UI agents: Direction B
(bar-led rows) with the Overview's Stat and ProgressBar as the hero.

```
Budgets                          [ Categories ]  < October 2026 >

+----------------------------------+ +---------------------------+
| 2 NEED A LOOK                    | | NEEDS A LOOK              |
| 785 of 910                       | | ! Transport  20 over      |
| [#############|###--]            | | o Property tax  in 8 days |
| 125 left, 17 a day               | |                           |
| 130 yearly, +35 outside, 42 unc. | |                           |
+----------------------------------+ +---------------------------+
+----------------------------------------------------------------+
| Food               [##################|#########]     220 left |
| 780 of 1,000 a month, includes subcategories                   |
|   Groceries                                          480 spent |
|   Covered by Food                                              |
|   Restaurant       [!!!!!!!!!!!!!!!!!!|!!!!!!!!]      30 over |
|   130 of 100 a month                                           |
|----------------------------------------------------------------|
| Property tax       [----------------------------]  400 to pay  |
| 0 of 400, due 1 Nov, in 8 days                                 |
|----------------------------------------------------------------|
| No budget (2)  v                                     35 spent  |
| Uncategorized                              42 spent  Review -> |
|----------------------------------------------------------------|
| Yearly budgets count from Oct 2026, to 24 Oct - Change         |
+----------------------------------------------------------------+
```

## Goals / Non-Goals

**Goals:**
- One row shape at every width, replacing the Table and stacked-list split.
- The Budgets page and the Overview can't disagree on figures or warnings.

**Non-Goals:**
- New tokens, fonts or chart types.
- Changing how figures are calculated, or the Overview page.
- A year's transactions in the sheet. That needs `getSpendingCell` to take a
  range and can come later.

## Decisions

**The summary carries what the page needs.** `budgets/summary/` gains `totals`
(`budget_totals` plus `yearly_spent_cents` and `uncategorized_cents`), `pace`,
`days_left` and `attention` (`categories`, `yearly`). Alternative: the page also
calls the Overview endpoint. Rejected: it does far more than the page needs.

**Attention moves to `budgets/attention.py`.** `_attention_categories` and
`_attention_yearly` go there, and `reports` imports them, since `reports`
already depends on `budgets`. The Overview's response doesn't change, and
`tests_overview.py` stays as its guard. The one dependency the other way is
`reports.spending.month_spending`, which the summary uses for uncategorized
spending so the headline equals the tile: it counts outflows only, unlike
`uncategorized_spent`. It only needs `budgets.utils`, so there is no cycle.

**Merge rows in `lib/budgetOverview.js`.** A pure function takes the summary and
categories and returns the list: tree order, each row's shape, group rows,
"Parent / Sub" names and the No budget group. Rows are tested there, and the
page stays layout. Alternative: a merged list from the API. Rejected: which row
shape to use is display logic, and yearly figures already arrive separately.

**Two row additions in `budget_rows`.** `group_spent_cents`, everything under a
parent without a budget in the month whatever the kind, because the frontend
only has yearly subcategories' year figures. And `overridden`, so a month
override can be marked.

**Warnings come from attention, not the row.** A monthly row is amber when its
id is in `attention.categories` and it isn't over, and yearly rows keep their
`ahead` flag. No second copy of the 85% rule.

**One `BudgetRow`, whole euros.** It composes the existing bar with `ListRow`'s
hover and `min-h-11` rhythm. Whole euros match the Overview tile; the sheet
shows exact amounts in the editor and transactions. The whole row is a button.

**`ProgressBar` gains `tone="positive"`.** A paid target must not turn critical
at 101%, so this tone wins over the over-limit colour and the fill is capped.

**Sheet for editing, at every width.** New `BudgetSheet` uses the extracted
`Sheet` wrapper (`PLACE` and Dialog from `SpendingSheet`), and the extracted
`useSpendingCell` hook and `SpendingRows` list. `BudgetEditor` keeps its logic and switches to a stacked
layout. The side sheet opens from 640px, the page's existing `isWide`.
Alternative: inline on desktop and a sheet on phones. Rejected: two editing
patterns, and the sheet shows the row's transactions too.

**The dropped-amounts dialog stays nested in the sheet.** Its behaviour is
specified, and `Dialog` already nests.

**Highlight on every save.** `handleBudgetSaved` no longer needs `movedTable`,
because rows don't move between tables.

**`/categories` is a plain move.** `CategoryForm`, `CategoryRow`, `TabBalance`
and `KindSwitch` move to `CategoriesPage.jsx` unchanged, with their tests.

**No budget means top-level.** Only a top-level category with no budget, and no
subcategory with one, collapses. A group with a capped subcategory stays in the
tree so the cap keeps its place. Collapsed subcategories show when expanded.

**Verdict in the frontend.** It's wording from `attention`, `totals` and whether
the month is past, current or future.

## Risks / Trade-offs

- [Rows are taller than the old table, about 56px against 44px] → Collapsing
  No budget and subcategories without a bar offsets part of it.
- [A yearly row's sheet shows only the viewed month] → The sheet names the month.
- [Whole euros hide small differences] → Exact amounts are one click away.
- [`BudgetsPage.test.jsx` is largely rewritten, so regressions can slip by] →
  Carry over its scenarios by spec requirement, not by file.
- [Monthly row warnings depend on attention being loaded] → They arrive in the
  same response.

## Migration Plan

No schema or data migration. New fields are additive for the Overview. Rolling
back restores the old page, and `/categories` links disappear with it.

# Tasks

## 1. Picker tree

- [x] 1.1 In `CategoryCombobox`, order an empty search by the flattened `buildCategoryTree` (with depth); keep orphaned subcategories at the top level with their full label; run `rankCategories` over that order while searching. Verify with `CategoryCombobox.test.jsx` cases for "Subcategories sit under their parent", "A parent can be picked", "Searching by the parent's name still finds children" and "Arrowing through the tree", with the existing ranking, highlight, tabs, transfer and Split cases still passing.
- [x] 1.2 Render the depths: parents with children in `font-medium`, children indented with a left guide by their own name, a subcategory's parent muted beside it in search results, `aria-label` "Parent / Child" on every subcategory option, and the list `max-h-80`. Verify with a test for "A subcategory match names its parent" (the visible text "Lunch" plus "Food", the accessible name "Food / Lunch", and choosing it selects the subcategory), then update page tests that query picker options by the old label (TransactionsPage, ReviewPage, ForecastingPage, BudgetsPage, TabPage, SplitEditor) so the frontend suite passes.

## 2. Check

- [x] 2.1 In the local stack with a few parents and subcategories, open the picker in the ledger cell, the add form, the filter and the split editor: check the tree on an empty search, the parent hint while typing, the arrow-key order, and light and dark mode. Verify that frontend `npm test`, `npm run lint` and `npm run build` pass.

## Workflow follow-up

- Open a GitHub issue for this change on the Reconciled project and reference it in proposal.md.
- Archive the change on its branch, then open the PR with `Fixes #N`.

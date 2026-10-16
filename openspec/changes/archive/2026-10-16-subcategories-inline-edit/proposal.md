# Proposal

## Why

Categorizing a transaction today means clicking "Edit" to open the full
row-edit form just to change one field. The user wants this to be fast:
click the category directly in the transaction table and pick from a
searchable, type-to-filter list - with the option to create a brand-new
category on the spot if it doesn't exist yet, no page switch required.
Separately, categories today are flat; the user wants a light hierarchy
(subcategories, exactly two levels) so related categories can be grouped
(e.g. "Groceries" with "Supermarket" and "Takeout" underneath).

Both pieces of this request only make sense together: the inline
picker's "create on the spot" affordance and its autocomplete list need
to know about the hierarchy to be useful, so this is one change, not two.

## What Changes

- Categories gain an optional parent category, exactly two levels deep -
  a subcategory cannot itself have subcategories. Enforced server-side,
  not just in the UI.
- Creating/editing a category can set its parent. The category list and
  monthly budget summary (Budgets page) show subcategories indented
  under their parent. Per the user's explicit choice: this is **display
  grouping only** - a parent's spend/limit stays independent of its
  subcategories' spend/limit; nothing rolls up or aggregates.
- Deleting a category that still has subcategories is blocked, the same
  way deleting one with assigned transactions already is - extending the
  existing reassign-first rule rather than silently cascading.
- Category name uniqueness changes from globally unique to unique
  *within its level*: two subcategories under different parents may
  share a name (e.g. "Other" under both "Groceries" and "Transport"),
  but two top-level categories, or two subcategories under the *same*
  parent, may not.
- The transaction ledger's category cell becomes directly editable: click
  it, get a searchable combobox (type to filter existing categories,
  including subcategories shown with their parent for context) instead
  of the current plain dropdown-in-a-form. Selecting a result saves
  immediately - no separate save step.
- Typing a name with no match offers "Create '<name>'" - confirming
  creates a new top-level category and assigns it to that transaction in
  one action. (Creating it as a *subcategory* of something is not
  supported from this quick-create path in v1 - use the Budgets page for
  that; noted as a Non-Goal in design.md, not silently dropped.)
- Scope is the transaction ledger's per-row category cell specifically
  (what the user asked to edit "directly on the table"). The existing
  full row-edit form's category field, and the ledger's filter-by-
  category dropdown, are unchanged plain selects - not replaced by the
  new combobox in this change.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `budgets`: "Create and edit category" gains an optional parent and the
  two-level constraint; "Delete category requires reassignment" extends
  to block deletion while subcategories exist; "View budget period
  summary" gains subcategory display grouping (no rollup).
- `transactions`: "Categorize transaction" gains the inline searchable
  combobox on the ledger's category cell, including creating a new
  category on the spot.

## Impact

- Backend: `budgets` app - `Category.parent` (self-FK) + two-level
  validation + revised uniqueness constraints (migration). Category
  serializer/viewset gain parent handling. No changes to `CategoryLimit`
  or the summary endpoint's spend *calculation* - only what the frontend
  does with the response changes (grouping for display).
- Frontend: a new reusable category combobox component (new dependency -
  see design.md), wired into the transaction ledger's category cell;
  `BudgetsPage` gains a parent picker on category create/edit and
  indented display for both the category list and the summary table.

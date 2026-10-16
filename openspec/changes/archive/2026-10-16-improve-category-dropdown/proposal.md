# Proposal

## Why

Picking a category takes the mouse, or at best an awkward key sequence.
In the searchable picker, typing on the focused control does nothing until
it's opened, and the "Uncategorized" option stays highlighted while the
user types, so `groc` + Enter clears the category instead of picking
Groceries. The add/edit transaction form, the recurring-transaction form
and the ledger's category filter use a plain dropdown that can't be
searched by typing at all. Categorizing many transactions should be a
type-and-go keyboard flow.

## What Changes

- The searchable category picker becomes keyboard-driven:
  - Typing a character while the closed picker has focus opens it and
    starts the search with that character.
  - The best match is highlighted automatically as the user types:
    matches where the name starts with the query come before matches
    that only contain the query.
  - The "no category" option (Uncategorized / All / No parent) is
    highlighted only when the search is empty. Otherwise it is listed
    only when its own label matches what was typed.
  - Enter picks the highlighted option and keeps focus on the picker.
    Tab picks the highlighted match and moves focus to the next field
    (Shift+Tab to the previous one). Escape closes the picker without
    changing anything.
  - On an empty search, the current selection is highlighted, so
    Enter or Tab leaves it unchanged.
  - When nothing matches, the "Create" option (ledger only) is
    highlighted and Enter creates it. Tab never creates a category.
- The add/edit transaction form, the recurring-transaction form on the
  Forecasting page, and the ledger's category filter switch from the plain
  dropdown to the searchable picker. In all three, subcategories are shown
  with their parent ("Groceries / Supermarket"), as the ledger cell already does.
- Not in scope: creating categories from the forms or the filter (still
  ledger-only), creating subcategories by typing "Parent / Child", and
  recent or frequent category suggestions.

## Capabilities

### New Capabilities
- `category-picker`: the shared searchable category control, covering
  how it opens, filters, ranks and highlights matches, and how it responds
  to the keyboard.

### Modified Capabilities
- `transactions`: the transaction form and the ledger's category filter
  pick categories with the searchable picker.
- `forecasting`: the recurring-transaction form picks its category with
  the searchable picker.

## Impact

- `frontend/src/components/CategoryCombobox.jsx` (keyboard handling,
  ranking, controlled highlight, `aria-label` passthrough) and its tests.
- `frontend/src/pages/TransactionsPage.jsx`: `TransactionForm` and the
  filter bar move from `Select` to `CategoryCombobox`, and form state
  changes from the `"uncategorized"` string sentinel to `id | null`.
- `frontend/src/pages/ForecastingPage.jsx`: the recurring-transaction
  form's category field changes the same way.
- Page tests that drive those `Select`s need updating.
- The Budgets parent picker gets the new keyboard behavior with no
  changes to its page.
- No backend, API or dependency changes.

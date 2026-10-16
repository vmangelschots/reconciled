# Tasks

## 1. Ranking and focus helpers

- [x] 1.1 Add `rankCategories(categories, categoriesById, query)` to `frontend/src/lib/categoryTree.js` (name-prefix, then label-prefix, then substring, stable within each group; empty query returns the input order). Verify with new cases in `categoryTree.test.js` covering the "mea" example from the spec, case-insensitivity and stable order.
- [x] 1.2 Add `focusAdjacentTabbable(el, direction)` in `frontend/src/lib/` (skips disabled, hidden and `tabindex="-1"` elements). Verify with a unit test that renders a row of buttons and inputs and checks that next/prev focus lands on the right neighbor.

## 2. Keyboard-driven CategoryCombobox

- [x] 2.1 Render the list from `rankCategories`, show the clear option on an empty query or when `clearLabel` matches (ranked after the matches), and forward an `aria-label` prop to the trigger. Verify the existing `CategoryCombobox.test.jsx` cases still pass, plus new tests: "Uncategorized" is hidden for "trans" and listed for "uncat".
- [x] 2.2 Control cmdk's highlight (`value`/`onValueChange`): recompute it on each query change (current value or clear on an empty query, best match, then create). Verify with tests: `groc` + Enter calls `onSelect(1)`; opening with value 2 + Enter calls `onSelect(2)`; "Pets" + Enter with `allowCreate` calls `onCreate("Pets")`.
- [x] 2.3 Type-to-open on the trigger (printable key without Ctrl/Meta/Alt seeds the query; ArrowDown opens) and `autoFocus` the search input. Verify with tests: focus the trigger, `keyboard("g")` → the input has focus with value "g"; `keyboard("{Control>}r{/Control}")` → still closed.
- [x] 2.4 Tab/Shift+Tab commit and focus move (no create on Tab), with Enter/Escape focus back on the trigger and the query reset on every close via a single `onOpenChange` wrapper. Verify with tests rendering the picker between two buttons: "trans" + Tab selects 2 and focuses the next button; Shift+Tab focuses the previous one; "Pets" + Tab calls neither `onSelect` nor `onCreate`; Escape leaves the value unchanged with the trigger focused and reopening shows an empty search.

## 3. Replace the remaining category Selects

- [x] 3.1 In `TransactionsPage.jsx`, switch `TransactionForm`'s category field to `CategoryCombobox` (`aria-label="Category"`, clear label "Uncategorized", state `id | null`). Verify with a `TransactionsPage.test.jsx` test that types "groc" + Tab in the add form, submits, and asserts the create call received the category id.
- [x] 3.2 Switch the ledger's category filter to `CategoryCombobox` (`aria-label="Filter by category"`, clear label "All", `null` → no `category` param). Remove the unused `UNCATEGORIZED`/`ALL_CATEGORIES`/`Select` imports. Verify with a test that types "trans" + Enter and asserts the transaction list request carries that category, then "all" + Enter clears it.
- [x] 3.3 In `ForecastingPage.jsx`, switch the recurring form's category field to `CategoryCombobox` (`aria-label="Category"`, clear label "Uncategorized", state `id | null`) and drop the now-unused constant. Verify with a `ForecastingPage.test.jsx` test that picks a category by typing + Tab and asserts the submitted payload.

## 4. Integration check

- [x] 4.1 Run the full frontend suite (`npm test` in `frontend/`) and lint, then on the running stack categorize several ledger rows, add a transaction and add a recurring transaction using only the keyboard. Verify there are no mouse steps and focus moves as the spec describes.

## 5. Instant inline category updates

- [x] 5.1 Make `handleInlineCategorySelect` in `TransactionsPage.jsx` update the row's category in local state before calling `updateTransaction`, drop the follow-up `reload()`, and restore the previous category with an error toast on failure. Verify with `TransactionsPage.test.jsx` tests: the row shows the new category while the update promise is pending and `listTransactions` is not called again; a rejected update restores the old category.
- [x] 5.2 Make `handleInlineCategoryCreate` show the typed name on the row immediately (temporary category entry), then swap in the created category's id after `createCategory` + `updateTransaction` resolve, without a reload. On failure, drop the temporary entry and restore the row. Verify with tests for the pending, success and failure paths.

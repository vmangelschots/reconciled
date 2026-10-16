# Tasks

## 1. Accounts page

- [x] 1.1 Track whether accounts have loaded at least once; render the table once loaded regardless of a background reload in flight, showing the "Loading..." placeholder only before the first successful load, and verify a component test: with data already loaded, triggering a reload keeps the existing rows rendered throughout (no placeholder reappears)
- [x] 1.2 Add a `pendingIds` set; disable a row's Edit/Archive buttons while that row's own action is in flight, and verify a component test: clicking Archive disables that row's buttons immediately, and re-enables (or the row is removed) once it resolves
- [x] 1.3 Archiving an account removes it from the displayed list directly from the archive response, with no follow-up reload, and verify a test: archiving calls the archive endpoint exactly once and no list-reload request follows it

## 2. Transactions page

- [x] 2.1 Apply the same "loaded once" gating as 1.1 to the transaction list, and verify the equivalent component test
- [x] 2.2 Apply the same per-row `pendingIds` gating as 1.2 to the Edit/Delete buttons (the category combobox's own pending state from the prior change is unaffected), and verify the equivalent component test
- [x] 2.3 Deleting a transaction removes it from the displayed list directly, with no follow-up reload, and verify a test: deleting calls the delete endpoint exactly once and no list-reload request follows it

## 3. Budgets page

- [x] 3.1 Add `pendingIds` gating to the category list's Rename/Delete buttons and the summary table's "Set limit" controls, and verify a component test covering at least the Delete button's immediate-disable behavior

## 4. Forecasting page

- [x] 4.1 Add `pendingIds` gating to the recurring-transactions list's Edit/Delete buttons, and verify a component test covering at least the Delete button's immediate-disable behavior

## 5. End-to-end verification against the real running stack

- [ ] 5.1 Verify manually against the live stack that deleting a transaction now visibly disables the row immediately and the row disappears without any loading-placeholder flash or page jump, and that the same holds for archiving an account

# Tasks

## 1. Split model and service

- [ ] 1.1 Add `split_parent` (self FK, `CASCADE`, `related_name="parts"`) to `Transaction` with a migration, plus a `TransactionQuerySet` with `ledger_rows()` and `counted_rows()`. Verify that `makemigrations --check` is clean and the existing backend suite passes.
- [ ] 1.2 Implement `transactions/splits.py` (`save_split`, `unsplit`, `delete_transaction`, `sync_parts`). Verify with `transactions/tests_splits.py` covering every transaction-splits backend scenario:
  - splitting, including from a categorized transaction;
  - rejection for a bad sum, a single part, mixed signs, splitting a part, splitting a transfer, and an unknown part id;
  - editing with kept ids, which preserves a transfer part's link;
  - removing a transfer part, with a created counterpart (deleted) and a real one (kept);
  - unsplitting, with a created counterpart and a real one, and with `keep` set to nothing, a category, or a transfer account (which matches the whole amount);
  - deleting a split transaction;
  - `sync_parts` moving date and payee and mirroring created counterparts.
- [ ] 1.3 Guard `transfers.py`: `link_transfer` refuses a split transaction, and `_find_match` skips split transactions and parts. Verify with `tests_transfers.py` cases for the "Splits are never matched" scenario and the refusal.

## 2. API

- [ ] 2.1 Add `PUT`/`DELETE /api/transactions/{id}/split/` (DELETE with an optional `category` or `transfer_account` to keep), the read-only `split_parent` and `parts` serializer fields, and route `perform_destroy` through `splits.delete_transaction`. Verify with `tests_split_api.py`: the response shapes, 400s with field errors (including PUT on a transfer or a part), and DELETE unsplitting with and without a kept target.
- [ ] 2.2 Add serializer guards:
  - reject `category`/`amount_cents` on a split transaction, and call `sync_parts` on its date or payee change;
  - reject `amount_cents`/`date`/`payee` on a part, while its `category`/`notes` and the transfer endpoints work on it.

  Verify with API tests for each guard and for recategorizing a part and making it a transfer.
- [ ] 2.3 Make the list endpoint return `ledger_rows()` with prefetched parts. The category filter matches a part's category (distinct), and search matches part notes. Verify with API tests for "Filter finds a split", search on part notes, and parts never appearing as top-level rows.

## 3. Totals count each amount once

- [ ] 3.1 Switch `Account.current_balance_cents` to `ledger_rows()`. Verify with an accounts test for "Splitting does not change the balance".
- [ ] 3.2 Base `reports/views._active_transactions()` and `BudgetSummaryView`'s uncategorized sum on `counted_rows()`. Verify with `reports/tests.py` and `budgets/tests.py` cases:
  - "A split counts once, without its transfer part";
  - dashboard "Split parts count toward their categories";
  - budgets "Split parts count toward their categories".
- [ ] 3.3 Make `flag_duplicates` scan `ledger_rows()`. Verify with `imports/tests.py` cases for "A re-imported split transaction is a duplicate" and "Parts are not duplicates".
- [ ] 3.4 In `categorize.py`, exclude parts from `confirmed_history()`, and parts and split transactions from `uncategorized()`/`categorize()` candidates. Verify with `tests_categorize.py` cases for "Parts are not history" and "Splits are skipped", including the Review page's uncategorized count.

## 4. Frontend

- [ ] 4.1 Add `saveSplit(id, parts)` and `unsplit(id, keep)` to `api/transactions.js`. Add an optional `onSplit` prop to `CategoryCombobox`: a "Split…" action after a separator with the `Split` icon, ranked last but first while the search is a prefix of "split". Verify with `CategoryCombobox.test.jsx`: "sp" plus Enter calls `onSplit` even with a "Sports" category, "gro" plus Enter still picks "Groceries", and no option is listed without the prop.
- [ ] 4.2 Right-align the ledger's Amount column with `tabular-nums`. Then show split groups:
  - the "Split · n" cell button opens the editor;
  - part rows sit beneath their transaction with a left bar, no inner dividers, a shared hover, empty Date/Payee, `↳` notes and muted amounts;
  - part rows have no Delete, and their Edit opens the editor;
  - while a category filter is active, parts in other categories are faded;
  - inline category and transfer edits on a part are optimistic and revert, through a helper that finds parts.

  Verify with `TransactionsPage.test.jsx` cases for "Split row and its parts", "Editing a part opens the split editor", "Filter finds a split" (the faded part), and recategorizing a part optimistically and reverting it.
- [ ] 4.3 Build `SplitEditor` with its line state and opening rules:
  - it replaces the part rows and shares `editingId` with the edit form;
  - "Split…" is offered only on unsplit, non-transfer rows;
  - a new split starts with the full amount plus the current target (a guess is carried over as a normal choice) and an empty second line with focus;
  - the first line follows the remainder until it is touched;
  - amounts are typed unsigned and take the transaction's sign;
  - an amount entered on the last line while money is left adds a line, and so does "+ Add part";
  - the status line covers left / over / all assigned / a part needs an amount;
  - Save is enabled only when allowed.

  Verify with page tests for "Lines replace part rows", "Split a dinner with one number", "An edited first line stops following", "Left to assign", "Over-assigned", "A line without an amount", "A new line appears while money is left", "Parts and transfers don't offer Split", "Typing finds Split before matching categories" and "One editor at a time".
- [ ] 4.4 Add saving, unsplitting and errors to the editor:
  - Save sends the signed parts and replaces the row;
  - Enter saves, and Escape cancels with focus on the row's cell;
  - Unsplit uses an inline confirmation and keeps the shared target or none;
  - a single remaining line turns Save into "Unsplit to <target>";
  - saving shows a pending state;
  - a failure keeps the editor open with a toast and outlines the line a 400 names;
  - removing a transfer line whose counterpart the app created shows the "Also removes the linked <account> transaction" hint;
  - the layout wraps below `sm` and stays sticky inside the scrolling table.

  Verify with page tests for "Enter saves", "Escape cancels", "Unsplit restores a shared category", "Down to one line", "Transfer target refused", and the save payload.
- [ ] 4.5 In `TransactionForm`, show a split transaction's parts read-only in place of the picker, with an "Edit split" button that opens the editor. Disable the amount with "Unsplit to change the amount", and omit `category` from the payload. Verify with form tests for "Edit a split transaction's payee" and "Edit split from the form".

## 5. Integration check

- [ ] 5.1 Run the backend and frontend suites, lint and build. Then rebuild the local stack and use the browser:
  - split a throwaway transaction into a category part and a transfer part, using only the keyboard;
  - check the other account's created counterpart, the account balance, the budgets page and both dashboard charts;
  - edit the split, unsplit it, and check the layout at phone width;
  - re-import the same CSV line and confirm it is flagged as a duplicate.

  Delete the throwaway data afterwards.

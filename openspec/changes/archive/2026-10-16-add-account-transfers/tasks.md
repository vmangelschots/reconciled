# Tasks

## 1. Transfer model and service

- [x] 1.1 Add `transfer_counterpart` (self one-to-one, `SET_NULL`) and `created_by_transfer` to `Transaction`, with a migration. Verify that `makemigrations --check` is clean afterwards and the existing backend suite passes.
- [x] 1.2 Implement `transactions/transfers.py` (`link_transfer`, `unlink_transfer`, `delete_transaction`, `mirror_edit`, `TRANSFER_MATCH_DAYS = 5`). Verify with `transactions/tests_transfers.py` covering every account-transfers scenario: matching across dates, the closest date winning, outside the window, counterpart creation, category clearing, unlink (confirmed vs created counterpart), delete, mirrored edits vs independent edits, and refusing the same account or an archived account.
- [x] 1.3 Expose it through the API: `POST`/`DELETE /api/transactions/{id}/transfer/`, a read-only `transfer` field, unlink-on-category PATCH, mirror-on-amount/date PATCH, and `perform_destroy` via the service. Verify with API tests for each endpoint and that the serializer's `transfer` shape matches the design.

## 2. Reports and budgets exclude transfers

- [x] 2.1 Exclude linked transactions from `CashFlowView`, `CategorySpendingView`'s uncategorized sum and `BudgetSummaryView`'s uncategorized sum. Verify with new `reports/tests.py` and `budgets/tests.py` cases for the dashboard and budgets "transfers are excluded" scenarios, alongside the existing tests.

## 3. Import confirms created counterparts

- [x] 3.1 Add `flag_transfer_matches` to the import preview and the replace-on-commit path, including the fallback when the match has disappeared by commit time. Verify with `imports/tests.py` cases: the bank line replaces the created counterpart (date, payee and description updated, link kept, flag cleared), an excluded match changes nothing, a confirmed counterpart is never matched again, and the fallback creates normally.
- [x] 3.2 Show "matches transfer from <account>" for those rows in the import preview UI. Verify with an import page test that the label renders and the row is selected by default.

## 4. Picker, ledger and form

- [x] 4.1 Add transfer options to `CategoryCombobox` (`transferAccounts`, `transferAccountId`, `direction`, `onSelectTransfer`; `account:<id>` values; ranked after categories and the clear option; trigger label). Verify with `CategoryCombobox.test.jsx` cases: typing "sav" lists "→ Savings"; Enter and Tab pick it and call `onSelectTransfer`; callers without `transferAccounts` render no transfer options; the trigger shows the transfer label.
- [x] 4.2 Wire the ledger cell: offer the other active accounts, show "→/← <account>" for transfers, pick a transfer optimistically with revert on failure, and unlink by picking a category. Add `api/transactions.js` `linkTransfer` / `unlinkTransfer`. Verify with `TransactionsPage.test.jsx` cases for each.
- [x] 4.3 Wire the add/edit transaction form: transfer options in its picker, create-then-link on add, re-link or unlink on save. Verify with form tests asserting the API call order and payloads.

## 5. Integration check

- [x] 5.1 Run the backend and frontend suites and lint, rebuild the local stack, then use only the keyboard in the browser:
  - mark a transaction as a transfer, both with a match and without one;
  - check both ledgers' labels;
  - unlink it via a category;
  - import a CSV line that confirms a created counterpart;
  - confirm the dashboard no longer counts the transfer.

  Use throwaway accounts and transactions, and delete them afterwards.

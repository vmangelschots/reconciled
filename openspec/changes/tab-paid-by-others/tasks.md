# Tasks

## 1. Data model

- [x] 1.1 Add `Account.is_off_bank`, `AccountQuerySet.visible()` and the migration. Verify in `accounts` tests that `visible()` leaves out the off-bank account and that its balance is 0 with covered entries in it.
- [x] 1.2 Add `Transaction.covered_tab_row` (self one-to-one, CASCADE, `related_name="covered_cost"`) and the migration. Verify that deleting a tab half deletes its cost half.

## 2. Covered entries backend

- [x] 2.1 Add `transactions/covered.py` with `create`, `update` and `delete`. They work on both halves atomically, create the off-bank account lazily, and reject an amount of zero or less and a category that is a tab or tab group. Verify in `tests_covered.py` with the "Record what the tab's person paid for" and "A covered entry's category is not a tab" scenarios, including that `tabs.tab_detail` and `reports.spending.month_spending` see the right amounts.
- [x] 2.2 Add `POST`, `PATCH` and `DELETE` under `/tabs/{id}/covered/`. Add `kind`, `covered_category` and `notes` to the tab detail rows. Verify in `tests_tab_api.py` with the edit and delete scenarios, and that a 404 is returned for a row that isn't a covered entry on that tab.
- [x] 2.3 Guard the pair:
  - Reject recategorizing either half through transaction update, bulk categorize and split. The tab half may still move to another tab.
  - Reject re-parenting a tab with covered entries out of its tab group.

  Verify with the "A tab with covered entries stays a tab" scenarios.
- [x] 2.4 Switch every account-listing site to `.visible()`: the account viewset, overview accounts, the tier lists, `balances.py`, the import and bank sync choices, the forecast lookup, and the transaction serializers' account and transfer fields. Verify with the "Covered entries are not in an account" scenarios: the accounts list, the Overview's Accounts tile and stale-import line, the ledger retrieve returning 404, and transfer targets.
- [ ] 2.5 Add `account_label(txn)` and use it in `_recent_row` and the spending cell view (rows and the header's `accounts`). Leave tab halves out of recent transactions. Verify in `tests_overview.py` and `reports/tests.py` with "A covered entry shows once", "In a report's transactions" and "Renaming the tab".
- [ ] 2.6 Verify a backup round-trip keeps the off-bank account, both halves and their link, in `backup/tests.py`.

## 3. Tab page UI

- [ ] 3.1 Add `tabPreviewSentence` (future tense) to `lib/tabs.js`, and the covered-entry calls to `api/tabs.js`. Verify in `tabs.test.js` for positive, negative and zero results.
- [ ] 3.2 Add `components/CoveredEntryForm.jsx`:
  - Amount (focused, € prefix), payee, category picker without tabs, and a date defaulting to today.
  - The preview line, inline field errors, Enter and Escape handling.
  - In edit mode, Delete with an inline confirm.

  Verify in `CoveredEntryForm.test.jsx` with the "Covered entry form" and "Keep on second thought" scenarios.
- [ ] 3.3 Wire the form into `TabPage.jsx`:
  - The header outline button (scrolls to the form and opens it, hidden while it's open) and the dashed last line, including on an empty tab.
  - Covered rows: verb "covered", category subtitle, receipt mark, no settle control.
  - Click a row to edit, one form at a time.
  - After a save, reload, show a toast, and expand and highlight a backdated row.

  Verify in `TabPage.test.jsx` with the "Covered rows on the tab page", "Edit and delete a covered entry" and modified "Tab page" scenarios.

## 4. Elsewhere in the UI

- [ ] 4.1 Show "Paid by <Tab>" as a link to the tab page in place of the account name in Overview recent transactions and in the `SpendingSheet` and `BudgetSheet` transaction lists. Show no "part of" and no edit affordance. Verify in `OverviewPage.test.jsx`, `SpendingSheet.test.jsx` and `BudgetSheet.test.jsx`.

## 5. Whole change

- [ ] 5.1 Run `python manage.py test`, and `npm test`, `npm run lint` and `npm run build` in `frontend/`, and verify all pass.
- [ ] 5.2 In the running app at 1280px and 390px wide, on a tab owed 10.00, add a 15.00 takeout entry Sarah paid for. Then:
  - Check that the preview and the balance read "You owe Sarah €5.00".
  - Check that the Takeout budget and report count it.
  - Check that the Overview shows it once as "Paid by Sarah".
  - Check that no "Paid by others" account appears anywhere.
  - Edit the entry, delete it, and check that every figure returns to before.

## Workflow follow-up

- Archive the change on its branch before the PR is merged.
- Open the PR with `Fixes #51`.

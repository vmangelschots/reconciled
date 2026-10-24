# Tasks

## 1. Tab groups and tab rows

- [x] 1.1 Add `Category.is_tab_group` with a migration. Add `in_tabs()`/`outside_tabs()` to `TransactionQuerySet`. Expose writable `is_tab_group` and read-only `is_tab` and `transaction_count` on `CategorySerializer`. Validate:
  - only top-level categories take the flag;
  - a category with its own transactions can't become a tab group, and the error carries the count.

  Verify with `budgets/tests.py` cases for "Make a tab group", "Subcategories can't be marked", "A group with its own transactions can't become a tab group" and "A subcategory of a tab group is a tab", plus re-parenting out of a group ("Moving a category out of a tab group"). Also check that `makemigrations --check` is clean.
- [x] 1.2 Add `budgets/tabs.py` `check_assignable()` and call it from `TransactionSerializer.validate_category`, `SplitLineSerializer` (which also covers the unsplit keep) and `confirm_categories`. Verify with API tests: a tab group is rejected on PATCH, on a split line, on unsplit keep and on bulk confirm, and nothing changes.

## 2. Reports leave tabs out

- [x] 2.1 Add `outside_tabs()` to `reports._active_transactions()`. Verify with `reports/tests.py` cases for "Half a dinner to a tab" (money out 30.00, "Restaurants" 30.00, no "Tabs" entry) and "A repayment is not income".
- [x] 2.2 Make `BudgetSummaryView` skip tab groups and tabs, and `set_limit` return 400 for them. Verify with `budgets/tests.py` cases for "Tabs are not in the summary" (including the uncategorized total) and "No limit on a tab".
- [x] 2.3 Leave tab groups and tabs out of `category_labels()`, and drop AI answers naming them. Verify with `tests_categorize.py` cases for "Tabs are not sent to the AI" (fake guesser records its categories), an AI answer naming a tab being ignored, and "History learns a repayer".

## 3. Tab balances API

- [x] 3.1 Implement `transactions/tabs.py` (`tab_rows`, `summarize`, `balances`). Verify with `transactions/tests_tabs.py` covering:
  - "Half a dinner to a tab";
  - "A repayment settles the tab";
  - partial and lump-sum repayments;
  - overpaying;
  - "A reimbursement inside a salary";
  - both "open since" scenarios;
  - running balances per row;
  - a tab with rows in an archived account still counting.
- [x] 3.2 Add `GET /api/tabs/` and `GET /api/tabs/{id}/`. Verify with API tests:
  - the list's fields and order (largest balance first);
  - an empty list when no tab exists;
  - the detail rows with `parent_amount_cents` on a part;
  - a 404 for a normal category and for a tab group.

## 4. Frontend: wording and picker

- [ ] 4.1 Add `api/tabs.js` (`listTabs`, `getTab`) and `lib/tabs.js` (`tabSentence`, `isStale`, `assignableCategories`). Verify with `lib/tabs.test.js` for the three sentences and their tones, the 30-day boundary, and tab groups being dropped.
- [ ] 4.2 Make `CategoryCombobox`:
  - list `is_tab` categories in a group per tab group, after the categories and before the transfers;
  - filter them by the search;
  - highlight the first tab when no category matches;
  - show `HandCoins` on tab items and on a trigger whose value is a tab.

  Route every transaction picker's categories through `assignableCategories`, and show the icon in the ledger cell. Verify with `CategoryCombobox.test.jsx` cases for "Tabs come after the categories", "Typing finds a tab" and the tab group not being an option. Add a `TransactionsPage.test.jsx` case for "A chosen tab is marked".

## 5. Frontend: dashboard, tab page and settings

- [ ] 5.1 Add `OpenTabsCard` as the first card on `DashboardPage`, and the "Excludes transfers and tabs" footnote under the in vs out chart. Verify with `DashboardPage.test.jsx` cases for "Open tabs are listed" (order, sentences, open-since and stale tone), "Everything settled", "No tabs", "Open a tab" (link target) and "The chart says what it leaves out".
- [ ] 5.2 Add `TabPage` at `/tabs/:id`:
  - a header with the sentence;
  - rows oldest first with lent/repaid, the unsigned amount, "part of €X" and the running balance;
  - "Settled" dividers, with earlier stretches collapsed behind "Show earlier";
  - not-found handling;
  - "Settled outside the account…" with a category picker that PATCHes and reloads.

  Verify with `TabPage.test.jsx` cases for "Rows with a running balance", "Older settled stretches are collapsed", "Unknown tab" and "Paid back in cash".
- [ ] 5.3 In `BudgetsPage`:
  - add the "Budget | Tab" control to `CategoryForm` for top-level categories, with the inherited kind shown read-only for subcategories;
  - add an inline confirmation when the kind changes and the group's subcategories have transactions;
  - in the category tree, show `HandCoins` and the balance sentence on tabs.

  Verify with `BudgetsPage.test.jsx` cases for "Make a tab group" (PATCH body), "Switching a group with rows asks first" (cancel sends nothing, confirm sends the change) and "Settings show tab balances".
- [ ] 5.4 Check phone width (390px) for the open tabs card and the tab page: rows stack and nothing scrolls sideways. Also run the whole flow in the local stack: make a "Tabs" group with "Jan", split a dinner half to Jan, categorize a repayment, then check the dashboard totals, the card and the tab page, and settle a row outside the account. Verify that the frontend `npm test`, `npm run lint` and `npm run build` pass, and that backend `python manage.py test` passes.

## Workflow follow-up

- Open a GitHub issue for tabs on the Reconciled project and reference it in proposal.md.
- Archive the change on its branch, then open the PR with `Fixes #N`.

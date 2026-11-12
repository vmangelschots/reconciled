# Tasks

## 1. Change signal and reload helpers

- [x] 1.1 Add `src/lib/dataChanged.js` with `notifyDataChanged()` and `onDataChanged(listener) → unsubscribe`; verify with `dataChanged.test.js` (listeners called, unsubscribe stops calls, a throwing listener doesn't stop the others)
- [x] 1.2 In `src/api/client.js`, call `notifyDataChanged()` from `apiFetch` and `apiUpload` after a successful response to POST/PUT/PATCH/DELETE (including 204), and not for GET, non-2xx or network errors; verify with cases in `client.test.js` for each of those
- [x] 1.3 Add `src/lib/useCoalescedRefresh.js` (one load in flight, at most one queued, only the newest result applied, errors swallowed) and `src/lib/useOnVisible.js` (calls back on `visibilitychange` to `visible`, cleans up on unmount); verify with tests: three calls during a pending load give exactly two loads, an out-of-order older response is not applied, a rejected load keeps the previous value, and visibility `hidden` → `visible` fires once

## 2. Shell providers stay current

- [x] 2.1 Rework `AccountsContext` to load through `useCoalescedRefresh`, reloading on `refreshKey`, on `onDataChanged` and on `useOnVisible`, and keeping `loaded` true after the first attempt; extend `AccountsContext.test.jsx`: a notified change shows the new total without re-render from outside, a tab-visible reload updates it, and a failing reload keeps the old total
- [x] 2.2 Rework `ReviewCountContext` the same way; add `ReviewCountContext.test.jsx` covering a notified change, tab-visible and a failed reload keeping the count
- [x] 2.3 In `BankSyncContext`, reload the status on `useOnVisible` (errors silent) so a sync that started while hidden starts polling; extend `BankSyncContext.test.jsx`: becoming visible while the server reports `running` shows it running, and when it ends `version` goes up
- [x] 2.4 Update the comments at the top of the three contexts and in `Layout.jsx` (`Shell`) to describe the new reload triggers; verify `npm run lint`

## 3. Remove manual refresh calls

- [x] 3.1 Remove the post-save `refreshAccounts()` / `refreshReviewCount()` / `refreshCount()` calls and their unused hook destructurings from `TransactionsPage`, `ImportPage`, `ReviewPage`, `LoanSchedulePage`, `SpendingSheet` and `BudgetSheet`, keeping each page's own `reload()`; update any of their tests that asserted those calls, and verify `npm test` and `npm run lint` pass

## 4. Integration check

- [x] 4.1 Add a `Layout.test.jsx` case rendering the shell with mocked APIs: after a mocked `updateTransaction` through `apiFetch`, the sidebar shows the new account balance and footer total while the route stays the same
- [x] 4.2 Run the app locally and confirm by hand: editing a transaction amount, deleting one, committing a CSV import and confirming a Review group each update the sidebar (balances, footer, Review count) without navigating; on a 390px viewport the pills' balance updates; switching to another tab and back after a change made in a second browser updates the sidebar; then run `npm test`, `npm run lint`, `npm run build` (checked in headless Chrome against a local stack; Review confirm is covered by the ReviewPage/ReviewCountContext tests, as the seeded data had no guesses)

## Workflow follow-up

- Open a PR from `change/live-sidebar-refresh`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

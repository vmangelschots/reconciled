# Proposal

Issue: #56

## Why

The sidebar's account balances, its Everyday/Total footer and the Review count
go stale as soon as data changes. They're reloaded only when the user moves to
another page or a bank sync ends, plus a few hand-placed refresh calls scattered
over the pages. Edit a transaction's amount, delete one, commit a file import,
link a transfer, record a value adjustment or change a loan schedule, and the
sidebar keeps showing the old numbers until you click somewhere else. The file
import commit, for example, refreshes the Review count but not the balances. A
sidebar that disagrees with the page under it makes you doubt both.

## What Changes

- **Any change you make updates the sidebar.** After any successful create,
  edit or delete (anything other than a read), the app reloads the shared
  account list and the Review count once. This covers transactions, splits,
  transfers, imports, value adjustments, loan schedules, categories, budgets
  and account settings. The account pills on narrow screens and the
  Overview's Accounts tile read the same list, so they update too.
- **Returning to the tab updates it.** When the app's tab becomes visible again
  after being hidden, it reloads the accounts, the Review count and the bank
  sync status. That catches changes made by another household member or in
  another tab, and a scheduled bank sync that started while you were away.
  The existing "sync ended → reload" path then takes over.
- **The scattered manual refresh calls go away.** The pages no longer need to
  remember to refresh the accounts or the Review count after their own saves.
  A missed one is exactly the bug being fixed here.
- Page changes and the end of a bank sync keep reloading these too, as they do
  today.

Out of scope: live push from the server (websockets or server-sent events),
periodic polling while the tab stays in front, and refreshing page content
other than the shell's shared data (each page already reloads its own data
after its own saves).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `ui-shell`: a new requirement that the sidebar's balances, footer total and
  Review count (and the account pills that share them) stay current after the
  user's own changes and when the tab is shown again.

## Impact

- Frontend only. `src/api/client.js` (`apiFetch`) announces a data change after
  every successful non-read request. `AccountsContext` and
  `ReviewCountContext` listen for it and for the tab becoming visible, and
  reload with coalescing, so a burst of saves causes one reload.
  `BankSyncContext` reloads its status when the tab becomes visible.
- The manual `refreshAccounts()` / `refreshReviewCount()` calls in
  `TransactionsPage`, `ImportPage`, `ReviewPage`, `LoanSchedulePage`,
  `SpendingSheet` and `BudgetSheet` are removed. The contexts keep their
  `refresh` function.
- No backend, API or database changes. No new dependencies.

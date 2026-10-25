# Tasks

## 1. Account types, tiers and ordering

- [x] 1.1 Add `investment`, `property` and `loan` to `Account.AccountType`,
  with a migration. Add `TYPE_TIERS`, `TIER_ORDER`, an `Account.tier`
  property and `tier` in the serializer, and order the account list by
  tier and then name, as in design.md. Verify with `accounts` tests for
  "Tier follows the type", "Changing the type moves the tier" and "A
  house after everyday accounts", and that
  `python manage.py makemigrations --check` is clean.
- [x] 1.2 In `frontend/src/api/accounts.js`:
  - add the types with their tier, and one tier-label map
  - group the Accounts page type select by tier, with "Other
    (everyday)"
  - show each account's tier in the list
  - for loans, label the starting balance "Still owed", negate it on
    save and on display, and reject a negative entry

  Verify with `AccountsPage` tests for "Choosing a type", "Create a
  mortgage" and editing a loan's starting balance.

## 2. Adjustment transactions

- [x] 2.1 Add `Transaction.is_adjustment` and `adjustment_value_cents`
  (migration), and a `TransactionQuerySet.excluding_adjustments()`
  helper. Verify that `makemigrations --check` is clean and the existing
  `transactions` tests pass.
- [x] 2.2 Add `recompute_adjustments(account)` and the signals that run it
  on transaction save/delete and account save, as in design.md. Verify
  with tests for "Back-dating keeps a later value", "An earlier
  transaction arrives", "Later transactions still count", "Delete the
  latest adjustment", "Delete an earlier adjustment", and a starting
  balance edit on an account with an adjustment.
- [x] 2.3 Add `POST /api/accounts/{id}/set-value/`. Verify with tests for
  "Revalue the house", "A value on an earlier date", "Same day replaces",
  "Same value still records the value", "Update the mortgage balance"
  (signed value), and 400s for a checking account and an archived
  account.
- [x] 2.4 Make the transaction API reject updates, category changes,
  transfer marking and splitting on an adjustment, while allowing DELETE.
  Verify with a test for each rejected action, and for "Type changed
  away" (adjustments kept and deletable, set-value rejected).
- [x] 2.5 Exclude adjustments in:
  - `active_transactions()`
  - `uncategorized_spent()`
  - `uncategorized()`
  - `needs_review()`
  - `flag_duplicates()`
  - the transfer match lookup

  Verify with tests for:
  - "Not in the month's change" (overview, dashboard, budget)
  - "Value adjustments are excluded" (dashboard)
  - "Value adjustments are not uncategorized spend" (budgets)
  - "Not waiting for review"
  - "Not matched by an import"

## 3. Overview and sidebar

- [x] 3.1 Add `tiers`, `everyday_cents`, and per-account `tier` and
  `last_value_date` to the overview response. Order its accounts by tier,
  and leave adjustments out of its recent list. Verify with `reports`
  tests for:
  - "Everyday, savings and a house"
  - "A mortgage lowers net worth"
  - "Archived accounts don't count"
  - "Only everyday accounts"
  - "Value adjustments are left out"
- [x] 3.2 Render the Everyday layout in `BalanceTile`:
  - tier lines and Net worth under a divider
  - debt in normal ink with a minus sign

  Verify with `OverviewPage` tests for the "Everyday money and net worth"
  scenarios and "The Loans line". Check it at 390px wide with no
  sideways scrolling, and that it sits level with the Budget tile on a
  wide screen.
- [x] 3.3 Make `freshness()` and `staleImportItem()` skip investment,
  property and loan accounts, and show "value set <d Mon>" or "No value
  set" for them in the Accounts tile. Verify with `OverviewPage` tests
  for "A valued account" and "A house is never stale".
- [x] 3.4 Add the everyday total and count to `AccountsContext`, and show
  "Everyday · N accounts" in `TotalReadout` when the accounts span more
  than one tier. Verify with a `Layout` test for "Everyday total next to
  a house", and that the existing two-account footer test still passes.

## 4. Ledger

- [x] 4.1 Render an adjustment row with:
  - the `Scale` icon, "Value adjustment" and "Set to €…"
  - a muted "—" for the category
  - a neutral amount
  - no Edit, split or transfer controls, with Delete kept in line

  Verify with `TransactionsPage` tests for "Shown in the ledger" and
  deleting an adjustment.
- [x] 4.2 Add the "Set value" dialog to the ledger header on investment,
  property and loan accounts, as in design.md. It has:
  - the current balance
  - a date field (default today)
  - a value field, which is "Still owed" for loans
  - a live adjustment preview
  - the loan note

  It posts to `set-value` and refreshes the ledger and the account
  balances. Verify with `TransactionsPage` tests for setting a value,
  "Update the mortgage balance" through "Still owed", and "Not offered on
  everyday or savings accounts".

## 5. End-to-end check

- [x] 5.1 In the running app:
  - create a property and a loan account, and set and back-date their
    values
  - check that the Overview shows Everyday with the tiers and Net worth,
    that the sidebar shows the everyday total, that neither account is
    flagged as stale, that budgets and the Review page are unchanged, and
    that the ledger shows "Set to" values that hold after back-dating

  Then run `npm test`, `npm run lint`, `npm run build` and
  `python manage.py test`.

## Workflow follow-up

- Archive the change on its branch before the PR is merged, and open the
  PR with `Fixes #24`.

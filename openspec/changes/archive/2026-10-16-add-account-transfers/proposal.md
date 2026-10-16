# Proposal

## Why

Moving money between your own accounts (checking to savings, paying off
a credit card) shows up today as an unrelated outflow in one account and
an inflow in the other. Both count as real spending and income: the
dashboard's "In vs out" double counts them, and the outflow lands in
"Uncategorized" in the budgets and the expenses chart. The app has no way
to say "these two lines are the same money moving".

## What Changes

- **Mark a transaction as a transfer** by picking the other account in
  the category picker. Your active accounts appear there under
  "Transfer to / from", in the ledger's inline category cell and in the
  add/edit transaction form. A transfer has no category; the ledger shows
  it as "→ Savings" or "← Checking".
- **Automatic linking:** when you mark a transaction, the app looks in
  the other account for an unlinked transaction with the opposite amount,
  dated within ±5 days. If there are several, it takes the closest date.
  It links the two, and each side keeps its own date.
- **Counterpart creation:** if nothing matches, the app creates the
  opposite transaction in the other account, on the same date, and links
  it. It's remembered as *created by a transfer* until a bank import
  confirms it.
- **Imports replace created counterparts:** when an import into an
  account contains a line with the same amount as a created counterpart
  there, within ±5 days, the import updates that transaction with the
  bank's date, payee and description instead of adding a new one. The
  link stays. The preview shows these lines as "matches transfer from
  Checking".
- **Unlinking:**
  - Picking a category (or Uncategorized) for a transfer unlinks it.
  - Deleting one side unlinks the other, and the other becomes a normal
    uncategorized transaction again.
  - A created counterpart that was never confirmed by an import is
    removed along with the link instead, since it only existed because
    of the transfer.
- **Edits:** editing the amount or date of a transfer updates a created
  counterpart to match. Two linked real transactions are edited
  independently, because their dates and amounts come from two banks.
- **Reports leave transfers out:** money in vs out, category spending,
  and budgets' uncategorized spend no longer count transfers. This
  resolves the dashboard's known limitation. Account balances still
  include them, since the money really did move.

Not in scope:
- Recurring transfers in the forecast.
- Transfers in a different currency or with fees, where the two amounts
  differ.
- Detecting transfer pairs during an import when neither side was
  marked.
- Transfers to accounts that aren't in the app (those stay normal
  transactions with a category).
- Archived accounts as new transfer targets. Existing links to them are
  kept.

## Capabilities

### New Capabilities
- `account-transfers`: marking, matching, creating, displaying, editing
  and unlinking transfers between two of the user's accounts.

### Modified Capabilities
- `dashboard`: money in/out and category spending exclude transfers.
- `budgets`: uncategorized spend excludes transfers.
- `transaction-import`: an imported line replaces a created transfer
  counterpart instead of duplicating it.

## Impact

- **Backend:**
  - A migration on `Transaction` adds a self-referencing one-to-one
    transfer link and a "created by transfer" flag.
  - A transfer service handles matching, creation, unlinking and
    mirroring edits.
  - New transfer endpoints on the transactions API.
  - Import preview and commit learn the counterpart replacement.
  - The `reports` and `budgets` aggregations exclude linked
    transactions.
- **Frontend:**
  - `CategoryCombobox` gets a "Transfer to / from" group of accounts.
  - The ledger cell and transaction form use it.
  - The ledger shows transfer labels.
  - The import preview shows "matches transfer".
- No new dependencies.

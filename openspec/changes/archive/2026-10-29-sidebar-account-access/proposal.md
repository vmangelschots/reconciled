# Proposal

Issue: #35

## Why

With more than five active accounts, the sidebar lists five and "+N
more", which links to Accounts. But an Accounts row only offers Edit and
Archive, and the Transactions page's account pills are hidden on wide
screens. So on a wide screen, the transactions of the sixth account and
up can only be reached by typing their address.

## What Changes

- **Accounts page.** An account's name opens its transactions.
- **Sidebar.** "+N more" expands the account list in place, with "Show
  fewer" to collapse it, instead of linking to Accounts. When the open
  account is one of the hidden ones, the list starts expanded, so the
  account marked as current is always visible.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ui-shell`: "Accounts under Transactions in the sidebar" expands in
  place instead of linking to Accounts.
- `accounts`: a new requirement that an account's name on the Accounts
  page opens its transactions.

## Impact

- `frontend/src/components/Layout.jsx`: `TransactionsGroup`, and its
  tests.
- `frontend/src/pages/AccountsPage.jsx`: the name cell becomes a link,
  and its tests.
- No backend change.

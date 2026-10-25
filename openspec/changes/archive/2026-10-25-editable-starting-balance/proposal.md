# Proposal

Issue: #15

## Why

Once an account has a transaction, its starting balance can no longer be
edited. A wrong opening figure is then stuck, and every balance the app
shows is off by the same amount. The only fix is to delete the account and
re-import. The rule protects nothing here. No stored figure depends on the
starting balance, because every balance (the accounts list, the overview
and the forecast) is computed from it plus the transactions on each read.

## What Changes

- **The starting balance can be edited at any time**, with or without
  transactions on the account, from the same account edit form as the
  name and type.
- **Every balance follows the edit.** The current balance, the overview
  totals and the forecast shift by the difference between the old and new
  starting balance. No transaction changes.
- The "starting balance can no longer be edited" rejection is removed.

Not in scope:
- A confirmation step before saving. The edit form already needs an
  explicit Save.
- "Set current balance": entering today's bank balance and having the
  starting balance worked out from it.
- Dated balance adjustments, or an opening date for the starting balance.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `accounts`: the starting balance becomes editable at any time, like the
  name and type. The "Starting balance is immutable once transactions
  exist" requirement is removed.

## Impact

- **Backend:**
  - `accounts/serializers.py` drops the `validate` guard.
  - `Account.has_transactions` in `accounts/models.py` loses its only
    caller and is removed.
  - The two "blocked" tests in `accounts/tests.py` become a test that
    the edit succeeds on an account with transactions and shifts the
    balance.
- **Frontend:** `AccountsPage.jsx` already sends the starting balance on
  every edit, so it needs no change.
- No migration and no new dependencies.

# Proposal

## Why

Transactions have a notes field that can be entered, edited and searched,
but the ledger doesn't show it. The only way to read a note is to open
the row's edit form.

## What Changes

- The ledger table gets a **Notes** column between Payee and Category.
- Notes show in secondary ink. A long note stays on one line, is cut off,
  and shows its full text on hover. A transaction without notes shows an
  empty cell.
- The Transactions page tests get a longer wait for the ledger table to
  appear. Under a full parallel test run, the default 1-second wait
  occasionally timed out.

Not in scope: editing notes inline in the ledger (the edit form already
does that), and showing notes anywhere other than the ledger.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `transactions`: the ledger shows each transaction's notes.

## Impact

- `frontend/src/pages/TransactionsPage.jsx`: one new column, and the
  ledger's full-width cells span 6 columns instead of 5.
- `frontend/src/pages/TransactionsPage.test.jsx`: a new test, and the
  `findTable` helper's timeout.
- No backend or API change: `notes` is already in the transaction payload.

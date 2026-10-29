# Proposal

Issue: #30

## Why

Re-importing a Crelan export that overlaps an earlier one creates a
duplicate for nearly every overlapping line, with all of them selected in
the preview. The duplicate check compares the file's description with the
stored transaction's payee. For a Crelan line those come from different
columns: the payee is "Tegenpartij" ("Ethias") and the description is
"Mededeling" ("Verzekeringstaks"). So a line that is already in the
ledger is never recognized. Only lines without a counterparty, such as
bank fees, are caught. Today the only way out is restoring a backup.

The same mix-up hits any import whose payee and description differ: an
OFX line with a memo, or a CSV with a separate payee column mapped.
Revolut, and CSVs without a payee column, work only because their payee
and description are the same text.

## What Changes

- An import line is compared with existing transactions by its payee
  instead of its description: same date, same amount, and a matching or
  highly similar payee.
- Everything else about duplicate detection stays as it is: each
  existing transaction marks at most one line, splits are compared as a
  whole and their parts never are, value adjustments are ignored, and the
  user can still re-include a flagged line.
- Out of scope: recognizing a line whose payee the user renamed after
  importing it, and cleaning up duplicates already in the ledger.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transaction-import`: "Detect likely duplicate transactions" matches on
  the payee rather than the description, with a Crelan scenario.

## Impact

- `backend/imports/utils.py`: `flag_duplicates` compares
  `candidate["payee"]` with `existing.payee`.
- `backend/imports/tests_bank_exports.py`: a Crelan re-import regression
  test, plus a CSV with a mapped payee column. The existing duplicate
  tests should pass unchanged.
- No API, frontend, model or migration changes.

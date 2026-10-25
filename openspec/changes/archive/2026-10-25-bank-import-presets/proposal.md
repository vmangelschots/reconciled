# Proposal

Issue: #21

## Why

Importing the two banks actually in use takes too much manual work. A
Revolut CSV can't be imported at all: its dates carry a time
("2026-10-12 2:00:00"), which none of the supported date formats accept.
Its file also mixes the current account with savings pockets
(`Product`), lists fees in a separate column, and can contain rows that
never completed. Crelan does import, but its columns and date format
have to be mapped again on every upload, even though the file looks the
same every time.

## What Changes

- **Recognized bank exports.** On upload, the system recognizes a
  Revolut or Crelan export by its header row and skips column mapping,
  the way OFX already does. The preview names the bank that was
  recognized.
  - **Crelan:** semicolon-separated, `DD/MM/YYYY` dates. The payee comes
    from the counterparty, then the communication, then the operation
    type, whichever is filled in first.
  - **Revolut:**
    - The transaction's date is the Started Date. The time is ignored.
    - The amount includes the fee (Amount − Fee), so balances match
      Revolut.
    - Only `COMPLETED` rows are imported. Pending, reverted and declined
      rows are left out.
- **Revolut pockets go to their own account.** When a Revolut file has
  rows for more than one Product, a step before the preview asks which
  account each Product goes to, or whether to skip it:
  - `Current` defaults to the account chosen for the upload.
  - The choices are remembered for the next import.
  - A pocket move such as "To pocket EUR Electricity" appears as −350.00
    in Current and +350.00 in Savings. On commit, the two sides are
    linked as a transfer between the two accounts.
  - An import counts toward the stale-import reminder for every account
    it imported into.
- **Generic CSV improvements:**
  - A date followed by a time parses with the chosen date format, and
    the time is ignored.
  - Each account remembers its last CSV column mapping and date format.
    They are preselected on the next upload when the file has the same
    columns.
- **Duplicate detection counts each match once.** An existing
  transaction can mark at most one line of an import as a likely
  duplicate. Two identical card payments on the same day (such as two
  −7.80 "LAGO Mons" payments) then aren't both hidden by a single
  earlier transaction.

Not in scope:
- Other banks, user-defined presets, and non-English Revolut exports.
- Currency conversion. Revolut rows are imported in the amount shown,
  whatever their currency.
- Checking imported rows against the file's balance column.
- Choosing which Revolut date to use. The Started Date is fixed.

## Capabilities

### New Capabilities
- `bank-export-formats`: recognizing a Revolut or Crelan export by its
  header, how each one's rows become transactions, sending Revolut
  Products to accounts (and remembering the choice), and linking pocket
  moves as transfers.

### Modified Capabilities
- `transaction-import`:
  - Upload hands a recognized export to `bank-export-formats` instead of
    asking for a column mapping.
  - Dates with a time part parse with the chosen format.
  - Each account remembers its last CSV mapping.
  - Duplicate detection claims each existing transaction once.
  - An import can create transactions in more than one account, and it
    counts as an import of every account it was sent to.

## Impact

- **Backend (`imports`):**
  - A small preset registry next to `utils.py`, holding header
    signatures and row parsers for Revolut and Crelan.
  - `ImportSession` gains a `preset` field, the Product→account
    assignment, and the set of accounts it imports into.
  - Candidates carry their target account and, for pocket moves, the
    index of the other side.
  - A per-account import settings model holds the remembered CSV mapping
    and the remembered Revolut Product→account choices.
  - Commit links pocket pairs with the existing
    `transactions.transfers.link_transfer`.
  - Migrations for the new fields and model.
- **Backend (`reports`):** the last import date per account also counts
  sessions that imported into the account without being its primary
  account.
- **Frontend (`ImportPage`):**
  - A "Recognized Revolut/Crelan export" note.
  - The Product→account step.
  - An Account column in the preview when an import goes to more than
    one account.
  - Pocket moves shown as transfers in the preview.
  - The remembered mapping preselected.
- No new dependencies. Imports of other CSV and OFX files keep working
  as before.

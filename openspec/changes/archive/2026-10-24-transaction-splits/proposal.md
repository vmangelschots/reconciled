# Proposal

Issue: #5

## Why

A transaction can carry only one category, but one bank line often pays
for more than one thing. A supermarket receipt can be part groceries and
part household. A €60 dinner can be €30 of my own spending and €30 a friend
will pay back. Today the user has to pick one category for the whole
amount, so budgets and the dashboard end up wrong either way. Splits are
also the groundwork for tracking money others owe the user ("tabs"), which
will be a follow-up change: there, part of a payment goes to a tab.

## What Changes

- **Split a transaction** into two or more parts. Each part has:
  - an amount;
  - a category, a transfer target (one of the user's other accounts), or
    no category;
  - optional notes.

  The parts must add up to the transaction's amount and have the same
  sign. Their date and payee are the transaction's own.
- **Parts are ordinary transactions underneath.** Each part can be
  categorized, confirmed, or made a transfer exactly like a whole
  transaction. A part that is a transfer links to (or creates) its
  counterpart in the other account under the existing transfer rules.
- **Ledger:**
  - The category cell of a split transaction shows "Split · n", and its
    parts are grouped beneath it, each with its own category cell.
  - The category picker gains "Split…". It opens an inline editor that
    replaces the part rows while open.
  - In the editor, the first line takes whatever is left over, so a
    two-way split takes one number and one pick.
  - The editor shows what is left to assign or over-assigned, and works
    fully from the keyboard.
  - The same editor edits an existing split, and has "Unsplit".
- **A transfer can't be split.** The user picks a category first. This
  avoids orphaning the other side of a transfer that came from an import.
- **Unsplit** removes the parts and keeps the category all parts shared,
  or the last line's category or transfer target when the user removes
  lines down to one. Otherwise the transaction is left uncategorized. A
  part that was a transfer is unlinked the way deleting a transfer
  unlinks it today: a counterpart the app created is removed, and a real
  one becomes a normal uncategorized transaction.
- **Editing and deleting a split transaction:**
  - Changing its date moves its parts to the new date.
  - Its amount can't be changed while it is split.
  - Deleting it deletes its parts.
- **Money is counted once:**
  - Account balances and import duplicate detection use the bank's line:
    a split transaction counts, its parts don't.
  - Budgets, the dashboard (money in/out and category spending) and the
    uncategorized totals use the parts: a split transaction itself counts
    nowhere, so it is never "uncategorized spending".
- **Imports and auto-categorization leave splits alone:**
  - An import never changes a split transaction or its parts.
  - The categorizer never guesses for a split transaction or a part.
  - History never learns from parts.
  - Transfer matching never picks a split transaction or a part as the
    other side.

Not in scope:
- Tabs, i.e. tracking what someone owes (a follow-up change built on
  this one).
- Splitting from the add/edit transaction form or during an import
  preview. The form shows a split transaction's parts read-only, with an
  "Edit split" action that opens the ledger editor.
- A dedicated "owed by someone else" option for a part. Until tabs
  exist, a friend's share left without a category counts as
  uncategorized spending.
- Splitting recurring transactions in the forecast.
- Parts with a different date or payee than their transaction.
- Percentage or "split evenly" helpers.

## Capabilities

### New Capabilities
- `transaction-splits`: splitting a transaction into parts, editing and
  unsplitting it, how parts behave and how they are shown in the ledger.

### Modified Capabilities
- `accounts`: a balance counts a split transaction once, not its parts as
  well.
- `budgets`: category spend comes from parts, and a split transaction is
  not uncategorized spend.
- `dashboard`: money in/out and category spending count parts instead of
  their split transaction.
- `transaction-import`: duplicate detection compares against whole
  transactions only, never parts.
- `auto-categorization`: split transactions and parts are never guessed,
  and history ignores parts.
- `account-transfers`: transfer matching never picks a split transaction
  or a part.

## Impact

- **Backend:**
  - A migration adds a nullable self-FK `split_parent` on `Transaction`.
  - A new `transactions/splits.py` service for split, edit and unsplit,
    reusing `transfers.py` for parts that are transfers.
  - Split endpoints on the transactions API, and a nested `parts` field
    in the serializer.
  - The ledger list returns only top-level rows.
  - Filters in `accounts` (balance), `budgets`, `reports`,
    `transactions/categorize.py`, `transactions/transfers.py` and
    `imports/utils.py`.
- **Frontend:**
  - `CategoryCombobox` gets a "Split…" option.
  - `TransactionsPage` gets part rows and the inline split editor.
  - The transaction form shows a split read-only.
  - New `api/transactions.js` calls.
- No new dependencies.

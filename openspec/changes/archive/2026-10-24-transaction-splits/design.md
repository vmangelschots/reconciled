# Design

## Context

- **`Transaction`** has one nullable `category` and a one-to-one
  `transfer_counterpart`.
  - Every transfer rule lives in `transactions/transfers.py`.
  - Every guessing rule lives in `transactions/categorize.py`.
  - The serializer unlinks a transfer when a category is written and
    mirrors date/amount edits to a created counterpart.
- **What counts toward each total today:** every query sums over all of an
  account's transactions, minus linked transfers where relevant.
  - `Account.current_balance_cents` sums all rows.
  - `reports/views.py` has one `_active_transactions()` base queryset.
  - `BudgetSummaryView` sums `category.transactions` and a separate
    uncategorized query.
  - `imports/utils.flag_duplicates` scans all rows of the account.
- **Frontend:**
  - `TransactionsPage` keeps a flat `transactions` list and updates rows
    optimistically by id.
  - `CategoryCombobox` already mixes categories, a clear option and
    transfer targets.

See proposal.md for why, and specs/ for the required behaviour.

## Goals / Non-Goals

**Goals:**
- Parts are full `Transaction` rows, so categorizing, confirming and
  transfers work on them with the existing code.
- One place defines "the rows the bank sees" and "the rows that are
  counted", so no total double-counts.
- `transactions/splits.py` owns every split rule, the same way
  `transfers.py` owns transfers.

**Non-Goals:**
- Nested splits, or parts on a different date or account.
- Optimistic UI for saving a split: a split can touch several rows and
  accounts, so the editor waits for the server.

## Decisions

### Data model: a self-FK from part to split transaction
Add `split_parent = ForeignKey("self", null=True, blank=True,
on_delete=CASCADE, related_name="parts")` to `Transaction`, with a
migration. No data migration is needed.

- A transaction **is split** when it has parts.
- A transaction **is a part** when `split_parent` is set.
- There is no denormalized `is_split` flag. An `Exists(parts)` subquery is
  cheap at this scale, and a flag could drift from the rows it describes.
- `CASCADE` is only a safety net. Deletes go through the service, so
  transfer parts are unlinked first. A raw cascade would orphan a created
  counterpart.

*Alternative considered:* a separate `TransactionSplit` table. It was
rejected while exploring this change, because transfers, confirmation and
history would all need duplicating for split rows.

### Two named querysets decide what is counted
A `TransactionQuerySet` on the model provides:
- `ledger_rows()`: `split_parent IS NULL`. These are the bank's lines.
  Used for account balance, import duplicate detection and the ledger
  list.
- `counted_rows()`: rows with no parts, i.e. unsplit transactions plus
  parts. Used by reports, budgets' uncategorized sum, `uncategorized()`
  (with parts also excluded there) and transfer matching (with parts also
  excluded there).

Both definitions sum to the same total for an account, because parts add
up to their split transaction. The balance uses `ledger_rows()` anyway,
because that is the bank's view and doesn't depend on the invariant
holding.

Budget spend per category keeps using `category.transactions`. Split
transactions never have a category, so that query already counts only
parts and unsplit rows.

### `transactions/splits.py` service
Every function is `atomic` and locks the split transaction with
`select_for_update`.

- `save_split(txn, lines)` creates or edits a split. Each line is
  `{id?, amount_cents, category | transfer_account | none, notes}`.
  1. Refuse if `txn` is a part or a transfer. Splitting a transfer would
     leave an imported counterpart orphaned; the user picks a category
     first.
  2. Validate: at least 2 lines, each non-zero with `txn`'s sign, adding up
     to `txn.amount_cents`, and every `id` belonging to `txn`'s parts.
  3. Clear `txn`'s category (confirmed, manual, no reason).
  4. Existing parts whose id isn't in `lines` are deleted via
     `transfers.delete_transaction`.
  5. Each line updates its part, or creates one (with `txn`'s account,
     date and payee, confirmed manual). Then it either:
     - sets the category, unlinking any transfer first, or
     - calls `link_transfer`, or
     - clears the category.

     When a kept part that is a transfer changes amount, `mirror_edit`
     follows.
- `unsplit(txn, keep=None)` deletes every part via
  `transfers.delete_transaction`. It then applies `keep`, which is a
  category, a transfer account or nothing: it sets that confirmed manual
  category, calls `link_transfer`, or leaves `txn` uncategorized. The
  parts are deleted before linking, so a kept transfer target matches
  against the whole amount and never against the old part's counterpart.
  The editor decides what to keep (the shared category, or the last line
  left); the server doesn't infer it.
- `delete_transaction(txn)` runs `unsplit` if `txn` is split, then
  `transfers.delete_transaction`. `perform_destroy` calls it.
- `sync_parts(txn)` copies `txn`'s date and payee to each part and runs
  `mirror_edit` on transfer parts. The serializer calls it after a date
  or payee change.

A line's existing id is kept on edit. Without that, every edit would
delete and recreate transfer parts, which would churn their counterparts
and lose an import-confirmed link.

### Guards in existing code
- **Serializer `update`:**
  - On a split transaction: reject `category` and `amount_cents`, and
    call `sync_parts` when `date` or `payee` changes.
  - On a part: reject `amount_cents`, `date` and `payee`. Those belong to
    the split; `category` and `notes` stay editable.
- **`link_transfer`:**
  - Raises `TransferError` for a split transaction.
  - `_find_match` excludes parts and split transactions.
- **`categorize.py`:**
  - `confirmed_history()` excludes parts.
  - `uncategorized()` excludes parts and split transactions.
  - `categorize()` drops parts and split transactions from its
    candidates, with one query for the latter.
- **`flag_duplicates`:** iterates `ledger_rows()`.

### API
- `PUT /api/transactions/{id}/split/` with `{"parts": [...]}` saves the
  split. It returns the split transaction, serialized with its parts.
  A 400 carries field errors (sum, sign, count, unknown part id, transfer
  error).
- `DELETE /api/transactions/{id}/split/` unsplits and returns the
  transaction. It takes an optional body: `{"category": id}` or
  `{"transfer_account": id}` to keep.
- `PUT` on a transfer or a part returns 400.
- **Serializer fields:**
  - a read-only `split_parent` id;
  - a read-only `parts` list: id, amount, category fields, notes and
    `transfer`, in id order. `null` for a part, `[]` for an unsplit
    transaction.
  - `transfer` also carries the counterpart's `created_by_transfer`, so
    the editor knows when removing a part also removes a transaction.
- **List endpoint:**
  - Returns only `ledger_rows()`, with parts prefetched.
  - The category filter becomes `Q(category=c) | Q(parts__category=c)`
    with `distinct()`.
  - Search also matches `parts__notes`.
- **Detail routes still reach parts,** so PATCH and the transfer actions
  work on a part.

### Frontend
- **`CategoryCombobox`** gets an optional `onSplit` prop.
  - When it is set, a "Split…" action is listed after a separator, with
    the lucide `Split` icon in accent text, like the "Create" option.
  - It ranks last, but first while the search text is a prefix of
    "split", so "sp" plus Enter splits even when "Sports" exists.
  - Only unsplit, non-transfer, top-level ledger rows pass `onSplit`.
- **Split row cell:** a button the size of the combobox trigger, reading
  "Split · n" with the same icon and a chevron that rotates while the
  editor is open. It opens the editor directly and never uses the
  guessed style.
- **Split group in the ledger:**
  - A split row and its parts read as one group: a 2px neutral left bar
    across them, no dividers inside the group, and one shared hover.
  - Part rows leave Date and Payee empty and start Notes with `↳`. Their
    amounts are muted, so the bank line stays primary.
  - Part rows have no Delete. Edit opens the split editor.
  - While a category filter is active, parts in other categories are
    faded to about 60% opacity.
  - The Amount column becomes right-aligned with `tabular-nums` across
    the whole ledger, so parts visibly add up.
- **One open editor.** The split editor shares the page's `editingId`
  state with the edit form, so opening one closes the other.
- **`SplitEditor`** replaces the part rows while open, with the split row
  tinted.
  - Each line has: an unsigned amount (the transaction's sign is
    applied), a `CategoryCombobox` with transfer targets and no
    `onSplit`, notes, and a × to remove it.
  - Line state is `{id?, amount, target, notes, touched}`. The first
    line's amount is derived (total minus the others) until its own
    input is edited, which sets `touched`.
  - A new split starts as [full amount with the current category or
    transfer, empty]. Focus goes to the second amount. A guessed
    category is carried over as a normal choice and saved confirmed.
  - An amount entered on the last line while money is left adds a new
    empty line. "+ Add part" does the same with the mouse.
  - The status line reads "€x left to assign" (amber), "€x over" (red,
    with the over-assigning input outlined) or "All assigned ✓" (green),
    and "a part needs an amount" while a line is empty.
  - Save is enabled only when everything is assigned and no line is
    empty.
    - With a single line left, Save reads "Unsplit to <target>" and calls
      `unsplit` with that target.
    - On an existing split, "Unsplit" sits on the left as a ghost
      button, and a first click turns it into an inline confirmation
      ("Unsplit? This removes n parts"). It keeps the category or
      transfer target all parts share, or nothing.
  - Keys: Tab follows the amount → category → notes order. Enter in an
    amount or notes field saves when allowed. Escape cancels and focuses
    the row's category cell.
  - Saving disables the inputs, shows "Saving…" and marks the row
    pending. On success the row is replaced with the response. On failure
    the editor stays open with a toast, and a 400 that names a line
    outlines that line with its message. Removing a transfer line shows
    the hint "Also removes the linked <account> transaction" when its
    counterpart was created by the app.
  - Below `sm`, each line wraps (amount and picker, then notes full
    width). The editor content is `sticky left-0` so it doesn't scroll
    sideways with the table.
- **Part rows** use the existing inline category and transfer handlers.
  Those handlers find rows through a helper that looks inside `parts`,
  so optimistic updates and reverts work unchanged.
- **`TransactionForm`** on a split transaction:
  - lists its parts read-only in place of the picker, with an "Edit
    split" button that closes the form and opens the editor;
  - disables the amount with the hint "Unsplit to change the amount";
  - leaves `category` out of the payload.
- **`api/transactions.js`** gains `saveSplit(id, parts)` and
  `unsplit(id, keep)`.

## Risks / Trade-offs

- **[A query forgets the new filter and double-counts]** → Every total
  goes through `ledger_rows()`/`counted_rows()`. Each spec scenario about
  counting (balance, budgets, both dashboard reports, duplicates,
  transfer matching, backfill count) gets a test with a split in the data.
- **[Part rows drift from their split transaction's date or payee]** →
  Only `save_split` and `sync_parts` write them, and the serializer
  rejects date, payee and amount on a part. Tests cover both paths.
- **[Editing a split re-links transfers unexpectedly]** → Kept ids
  preserve a part's link. Only a target change or removal touches it.
- **[Auto-categorization history loses evidence]** → Parts don't feed
  history. This is a deliberate trade: a 50% part says little about the
  payee's usual category.

## Migration Plan

One additive migration (a nullable FK). Existing data has no parts, so
every total is unchanged after deploying. To roll back, unsplit any splits
(or delete their parts) before reverting the migration. Otherwise the
parts become ordinary rows and double-count.

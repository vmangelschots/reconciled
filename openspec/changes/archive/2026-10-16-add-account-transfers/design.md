# Design

## Context

- **Transactions:** `Transaction` has `account`, `date`, `amount_cents`,
  `payee`, a nullable `category` and `notes`. The serializer forbids
  moving a transaction to another account.
- **Category picker:** `CategoryCombobox` is the single picker used by the
  ledger cell, the transaction form, the ledger filter and the recurring
  form. Its value is a category id or `null`, and its ranking and
  keyboard behaviour live in the component and `rankCategories`.
- **Imports:** `flag_duplicates` matches exact date, exact amount and a
  fuzzy payee, and `commit` uses `bulk_create`.
- **Reports and budgets:** `reports/views.py` and `BudgetSummaryView`
  aggregate over all transactions in scope.

See proposal.md for why transfers are needed and specs/ for the
required behaviour.

## Goals / Non-Goals

**Goals:**
- One backend service owns every transfer rule (match, create, unlink,
  mirror edits). Views and the import only call it.
- Reuse the existing picker and its keyboard flow; a transfer target is
  just another kind of option.

**Non-Goals:**
- A separate "transfer" entity or a double-entry ledger. A transfer is
  two ordinary transactions plus a link.
- Showing transfers in the forecast.

## Decisions

### Data model: a symmetric self-link plus a "created" flag
Add to `Transaction`:
- `transfer_counterpart = OneToOneField("self", null=True, blank=True,
  on_delete=SET_NULL, related_name="+")`. Both sides point at each
  other, and the one-to-one constraint guarantees at most one link per
  transaction. `SET_NULL` means deleting one side automatically unlinks
  the other.
- `created_by_transfer = BooleanField(default=False)`, set on a
  counterpart the app generated and cleared when an import confirms it.

A transaction is a transfer when `transfer_counterpart` is set. Its
`category` is then always null; the service enforces this.

*Alternative considered:* a `Transfer` model with two FKs. It's cleaner
to query "all transfers", but every read of a transaction would need a
join to find its other side, and nothing here needs a transfer as its own
entity.

### `transactions/transfers.py` service
Every function runs in `transaction.atomic()` with `select_for_update`
on the rows it touches.
- `link_transfer(txn, target_account)`:
  1. Refuse if the target is `txn.account` or an archived account.
  2. Unlink `txn` first if it's already linked.
  3. Clear its category.
  4. Find candidates in the target account: unlinked, `amount_cents ==
     -txn.amount_cents`, date within ±5 days (`TRANSFER_MATCH_DAYS = 5`),
     ordered by `abs(date - txn.date)` then `id`.
  5. Link the first one, clearing its category, or create the
     counterpart with `payee` "Transfer from/to <account>" and
     `created_by_transfer=True`.
- `unlink_transfer(txn)`: clear both links. Delete the counterpart if
  `created_by_transfer`, otherwise leave it as an uncategorized normal
  transaction.
- `delete_transaction(txn)`: unlink (deleting a created counterpart),
  then delete. It's used by the viewset's `perform_destroy`.
- `mirror_edit(txn)`: after a save that changed `amount_cents` or
  `date`, if the counterpart is `created_by_transfer`, set it to
  `-amount` and the same date.

### API
- `POST /api/transactions/{id}/transfer/` with `{"account": <id>}`
  links and returns both transactions. `DELETE` on the same URL unlinks.
- The serializer adds a read-only `transfer`:
  `{"counterpart_id", "account_id", "account_name"}` or `null`.
- A PATCH that sets `category` (including to null) on a transfer calls
  `unlink_transfer` first, so "picking a category unlinks" holds for
  every client.
- A PATCH that changes `amount_cents` or `date` on a transfer calls
  `mirror_edit` after saving.

### Picker: transfer options in `CategoryCombobox`
- New optional props: `transferAccounts` (`[{id, name}]`),
  `transferAccountId` (the current value when the row is a transfer) and
  `onSelectTransfer(accountId)`.
- Transfer options use cmdk values `account:<id>` so they never collide
  with category ids. They're ranked with the same name-prefix /
  substring rules, listed after the category matches and the clear
  option and before "Create". They're labelled "→ Savings" or
  "← Savings" according to the amount's sign, which the caller passes as
  `direction`.
- Callers that don't pass `transferAccounts` (the filter, recurring form
  and Budgets parent picker) are unchanged.
- The trigger shows the transfer label when `transferAccountId` is set.
- Enter, Tab and highlighting work exactly as they do for categories.

### Ledger and form wiring
- The ledger passes the page's accounts, minus the current one and
  archived ones.
- Choosing a transfer is optimistic like category picks: the row shows
  "→ Savings" at once, then calls the transfer endpoint, and reverts with
  an error toast on failure.
- The add form creates the transaction, then calls the transfer
  endpoint. The edit form calls it on save if the target changed.

### Import: confirm created counterparts
`flag_transfer_matches(account, candidates)` runs after
`flag_duplicates`. For each candidate, it looks for a
`created_by_transfer` transaction in the account with equal
`amount_cents` within ±5 days, not already claimed by an earlier
candidate, closest date first. It sets
`candidate["transfer_match"] = {"transaction_id", "counterpart_account_name"}`
and `is_duplicate = False`. At commit, a selected candidate with a match
updates that transaction (`date`, `payee`, `notes`,
`created_by_transfer=False`) instead of being bulk-created. If the
matched row is no longer a created counterpart by commit time (it was
deleted or unlinked meanwhile), the candidate is created normally.

### Reports and budgets
Add `transfer_counterpart__isnull=True` to the cash-flow and
category-spending querysets and to `BudgetSummaryView`'s uncategorized
sum. Category totals are already transfer-free, because a transfer has
no category.

## Risks / Trade-offs

- [Linking the wrong transaction when two same-amount transactions fall
  in the window] → the closest date wins, and the user can unlink or
  re-target from the picker. Each link is visible in both ledgers.
- [The created counterpart's payee "Transfer from Checking" fails the
  fuzzy duplicate check] → that's intended: the import uses the
  dedicated transfer match instead, which ignores the payee.
- [A created counterpart's balance effect appears before the bank books
  it] → expected and visible. It's what the user asked for, since
  balances reflect the transfer immediately.
- [The migration on a populated table] → it only adds nullable and
  defaulted columns, so it's instant on Postgres and needs no backfill.

## Migration Plan

Deploy as usual: the backend's init container runs the migration before
gunicorn starts. To roll back, unlink everything first (no data is lost,
since both sides are ordinary transactions), then revert the image and
migration.

# Design

## Context

- **Import flow.** `imports.views.ImportSessionViewSet` handles the
  steps:
  - `create` (upload) sniffs the delimiter. A CSV upload returns the
    header columns. An OFX upload parses straight to candidates.
  - `map` parses a CSV with the user's mapping.
  - `_store_candidates` runs `flag_duplicates`, then
    `flag_transfer_matches`, and saves `session.candidates`.
  - `commit` bulk-creates the selected candidates on `session.account`,
    then runs `categorize(created)`.
  - Everything assumes a single account per session.
- **Parsing.** `imports/utils.py` maps each fixed `DATE_FORMATS` key to
  a strptime pattern. `_parse_date` rejects anything after the date, and
  that is what blocks Revolut today.
- **Duplicates.** `flag_duplicates` groups existing ledger rows by
  (date, amount), and every candidate checks the whole group. Nothing is
  claimed, so one existing row can flag several identical lines.
- **Transfers.** `transactions.transfers.link_transfer(txn, target)`
  links to the closest unlinked opposite amount within 5 days, or
  creates a counterpart.
- **Last import.** `reports.views` (around line 252) takes the newest
  committed `ImportSession.created_at` per `session.account`.
- **Real files.** The Revolut sample is in the proposal request. The
  Crelan header and value shapes were checked against a real export:
  - columns `Datum;Bedrag;Saldo na verrichting;Munt;Tegenpartij;Rekening
    tegenpartij;Type verrichting;Mededeling;Rekening opdrachtgever`;
  - dot decimals such as `-.99`;
  - `Tegenpartij` and `Mededeling` are often empty.

## Goals / Non-Goals

**Goals:**
- Bank formats are data plus a row parser in one module. Adding a third
  bank shouldn't touch the views.
- A session can import into several accounts without changing the
  single-account path: CSV with mapping, OFX and Crelan behave exactly
  as before.
- Pocket pairs are linked to each other exactly, never by the fuzzy
  closest-date search.

**Non-Goals:**
- A UI for defining presets.
- Changing OFX handling.
- Running categorization in the background (issue #2).

## Decisions

### A preset registry in `imports/presets.py`
- Each preset is a small object with:
  - `key` (`"revolut"`, `"crelan"`) and a `label`;
  - `required_columns`, the set that identifies the file;
  - `parse(rows) -> list[candidate]`.
- `detect_preset(columns)` returns the first preset whose required
  columns are all in the header, or `None`.
  - Revolut requires `Product, Started Date, Description, Amount, Fee,
    State`.
  - Crelan requires `Datum, Bedrag, Tegenpartij, Type verrichting,
    Mededeling`.
- Matching a subset rather than the exact header lets the banks add a
  column later without breaking detection.
- Revolut candidates carry two extra internal keys:
  - `product`;
  - `started_at`, the full Started Date string, used for pairing.
- **Alternative considered:** storing presets as saved column mappings.
  It was rejected because neither bank fits a mapping. Revolut needs
  Amount − Fee, a State filter and Product routing. Crelan needs a
  three-column payee fallback.

### Upload with a preset
- `create` sniffs the delimiter, reads the header and calls
  `detect_preset`. On a match it stores `session.preset`.
  - **One account involved** (Crelan, or Revolut with a single
    Product): parse at once and return candidates, like OFX does.
  - **Revolut with several Products:** return `products` (in file order)
    and `product_accounts`. `product_accounts` has the upload account
    preselected for `Current` and the remembered choices for the other
    Products. Then a new `assign` action takes `{product: account_id |
    null}`, checks that every Product has a choice and every chosen
    account is active, and parses. `null` means skip.
- A separate `assign` action, not a reused `map`, keeps the CSV mapping
  validation unchanged and makes each request's meaning obvious.

### Candidates carry their account
- Each candidate gets an `account_id` and `account_name`, set on every
  path. Non-Revolut paths use the session account.
- `flag_duplicates` and `flag_transfer_matches` group candidates by
  `account_id` and query each account separately. They still take a
  single account argument per group, so their callers keep the same
  shape.
- `commit` creates each row on `candidate["account_id"]`.
  `ImportSession.account` stays the upload account. The reports and the
  Import page's preselection read it.

### Duplicates claim once
- In `flag_duplicates`, each existing transaction is claimed by the
  first similar candidate in file order, and later candidates skip
  claimed rows. This is the same claimed-set pattern
  `flag_transfer_matches` already uses.

### Pocket pairs
- After parsing, for a Revolut session, a pass pairs candidates on
  different accounts with equal `started_at` and opposite
  `amount_cents`. Each side gets `pocket_pair: {"index": other,
  "account_name": ...}`.
- Paired candidates are passed over by `flag_transfer_matches`. A pocket
  move is matched within the file, not against created counterparts.
- At commit, a pair whose two indices are both selected and both
  created is linked by a new `link_pair(a, b)` in
  `transactions/transfers.py`. It sets `transfer_counterpart` on both
  sides and clears both categories. Both sides came from the bank, so
  `created_by_transfer` stays False and later edits stay independent
  (see `account-transfers`).
  - **Alternative considered:** `link_transfer`. It was rejected because
    it searches by closest date and could link a different +350.00 in
    the same week.
- Linked rows are left out of `categorize(...)`.
- The preview shows `→ <account>` / `← <account>` in the Match column,
  using the same arrow wording as the ledger.

### Dates with a time
- `_parse_date` splits the value on the first whitespace and parses only
  the first part. None of the supported formats contain spaces, so this
  can't change how a date that already works is parsed.
- Revolut's parser calls the same helper with `YYYY-MM-DD`.

### Remembered choices: `AccountImportSettings`
- A new model in `imports` has a one-to-one link to `Account` and two
  fields:
  - `csv_mapping`: JSON or null, holding the field→column dict and the
    `date_format`;
  - `product_accounts`: JSON, `{product: account_id | null}`.
- Both are written at commit, never earlier, so an abandoned import
  doesn't change what is remembered. To make that possible, the session
  stores the `mapping` it was parsed with and the `product_accounts` it
  was assigned.
- Upload returns `saved_mapping` only when every remembered column is in
  the new header. The page preselects from it.
- At upload, a remembered product account that has been archived or
  deleted since is treated as no choice.
- **Alternative considered:** fields on `Account`. It was rejected to
  keep import-only state inside the `imports` app.

### Which accounts an import counts for
- `ImportSession` gets a `imported_accounts` many-to-many field, filled
  at commit with every account that had candidates in the session,
  ticked or not. Skipped Products have no candidates, so they never
  appear.
- A data migration fills it from `account` for existing committed
  sessions.
- The reports' last-import query switches to `imported_accounts`.

### Frontend
- `ImportPage` gains an "Accounts" step, shown when the upload returns
  `products` without candidates. It has one `Select` per Product,
  listing the active accounts plus "Don't import", and nothing
  preselected without a remembered choice. Continue is disabled until
  every Product has a choice.
- The preview gains:
  - a note naming the recognized bank;
  - an Account column, only when the candidates span more than one
    account.
- The mapping step initializes `mapping` and `dateFormat` from
  `saved_mapping`.

## Risks / Trade-offs

- [Revolut changes its header or exports in another language] → The
  file is no longer recognized and goes through column mapping. It still
  imports, now that dates with a time parse. A detection test pins the
  current header.
- [Two unrelated rows on different Products share a timestamp and
  opposite amounts] → They would be linked as a pocket move. With
  second-level timestamps this is very unlikely. The link can be undone
  from the category picker.
- [A remembered mapping preselects the wrong columns] → It is only
  preselected and stays visible and editable before Parse.
- [Revolut amounts in another currency are imported as-is] → Out of
  scope (proposal). These accounts are EUR.

## Migration Plan

- One migration adds `ImportSession.preset`, `mapping`,
  `product_accounts` and `imported_accounts`, plus the
  `AccountImportSettings` model.
- A data migration backfills `imported_accounts` for committed sessions.
- No change is needed to existing transactions. Rollback is reverting
  the migrations. Remembered settings are lost, and nothing else is.

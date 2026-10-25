# Tasks

## 1. Data model

- [ ] 1.1 Change `imports/models.py` as in design.md:
  - add `ImportSession.preset` (blank allowed), `mapping` (JSON, null),
    `product_accounts` (JSON, default `{}`) and `imported_accounts`
    (many-to-many to `Account`);
  - add `AccountImportSettings` (one-to-one to `Account`, `csv_mapping`
    as nullable JSON, `product_accounts` as JSON);
  - write a schema migration and a data migration that fills
    `imported_accounts` from `account` for committed sessions;
  - register the new model in the admin.

  Verify that `python manage.py makemigrations --check` is clean, that a
  migration test shows a committed session getting its account in
  `imported_accounts`, and that the existing `imports` and `reports`
  tests pass.

## 2. Parsing fixes

- [ ] 2.1 Make `_parse_date` parse only the part before the first
  whitespace. Verify with `imports` tests for "A date with a time" and
  for an existing date-only value that parses unchanged.
- [ ] 2.2 Make `flag_duplicates` claim each existing transaction once, in
  file order. Verify with tests for "Two identical payments on one day"
  and "Both identical payments re-imported", and that the existing
  duplicate and split-duplicate tests still pass.

## 3. Bank presets

- [ ] 3.1 Add `imports/presets.py` with `detect_preset(columns)` and the
  Crelan and Revolut parsers (Started Date, Amount − Fee, COMPLETED
  only, plus `product` and `started_at` per candidate). Verify with
  `SimpleTestCase` tests for:
  - detection of both headers, and a non-matching header returning
    `None`;
  - "A row with a counterparty" and "A row without a counterparty or
    communication";
  - "A card payment uses the day it was made", "The fee is part of the
    amount" and "Unfinished rows are left out", using rows from the
    proposal's Revolut sample.
- [ ] 3.2 Add the pocket-pair pass: same `started_at`, opposite amounts,
  different accounts. Verify with unit tests for the "To pocket EUR
  Electricity" -350/+350 pair, the unpaired "Luminus SA" row, and two
  rows on the same account that never pair.

## 4. Import API

- [ ] 4.1 Make candidates carry `account_id` and `account_name` on every
  path. Run duplicate and transfer flagging per account, skip
  pocket-paired candidates in `flag_transfer_matches`, and have `commit`
  create each row on its candidate's account and fill
  `imported_accounts`. Verify that the existing `imports` tests pass
  unchanged (CSV, OFX and the transfer confirmation all go to the one
  account) and that there is a test for "Confirm an import".
- [ ] 4.2 In `create`, detect presets. Crelan, and Revolut with a single
  Product, return candidates at once with `preset`. Revolut with several
  Products returns `products` and the preselected `product_accounts`.
  Add the `assign` action, which rejects a missing choice or an
  archived account. Verify with API tests for:
  - "A Revolut export skips mapping", "A Crelan export skips mapping"
    and "Other files are mapped as before";
  - "Current and Savings in one file", "Skip a product" and "Only the
    current account";
  - "A new product must be chosen" (the `assign` call is rejected).
- [ ] 4.3 At commit, link both-selected pocket pairs with a new
  `transactions.transfers.link_pair`, and leave linked rows out of
  `categorize`. Verify with API tests for:
  - "Money moved into a pocket" (both rows linked, neither categorized,
    `created_by_transfer` False);
  - "Only one side committed";
  - "A pocket move stays a transfer";
  - "An import into two accounts".
- [ ] 4.4 At commit, save the session's `mapping` (CSV) or
  `product_accounts` (Revolut) to the upload account's
  `AccountImportSettings`. Have upload return `saved_mapping` when every
  remembered column is present, and preselect remembered product
  accounts, dropping any that are archived or gone. Verify with API
  tests for:
  - "Second upload is preselected", "Different columns start empty" and
    "Remembered per account";
  - "The second import remembers";
  - an uncommitted session not changing what is remembered.

## 5. Last import

- [ ] 5.1 Switch the reports' last-import query to `imported_accounts`.
  Verify with a `reports` overview test for "The pocket account is
  imported too", and that `test_last_import_date_per_account` still
  passes.

## 6. Import page

- [ ] 6.1 In `ImportPage.jsx`, add the Accounts step: one Select per
  Product with the active accounts plus "Don't import", Continue
  disabled until every Product has a choice, and a call to
  `assignProducts` in `api/imports.js`. Verify with `ImportPage.test.jsx`
  tests that cover the preselected Current, the remembered Savings, a
  blocked Continue for an unchosen Product, and Skip.
- [ ] 6.2 In the preview, add the "Recognized as a <bank> export" note,
  an Account column when the candidates span several accounts, and
  `→ <account>` / `← <account>` for pocket pairs in the Match column.
  Verify with `ImportPage.test.jsx` tests for a Revolut two-account
  preview and a single-account preview without the Account column.
- [ ] 6.3 Preselect the mapping step from `saved_mapping`. Verify with
  an `ImportPage.test.jsx` test where the upload response's
  `saved_mapping` fills the selects and the date format. Run
  `npm test`, `npm run lint` and `npm run build`.

## 7. End-to-end check

- [ ] 7.1 On the local stack, against throwaway accounts:
  - Import the proposal's Revolut sample with Savings sent to a pocket
    account. Check that the dates are the Started Dates, that the
    Current balance change equals the sum of the Current amounts, that
    the "To pocket EUR Electricity" pair is linked, that Luminus SA is
    in the pocket account, and that both accounts show today as last
    import.
  - Re-import the sample. Check that every line is a likely duplicate,
    including both LAGO Mons -7.80 lines.
  - Import a real Crelan export without mapping. Check that the payees
    follow the fallback order.
  - Delete the throwaway accounts afterwards, and leave the real
    accounts untouched.

## Workflow follow-up

- Commit the proposal artifacts as `Propose bank-import-presets: ...`
  once the user agrees with them.
- Archive the change on its branch before the PR is merged, and open the
  PR with `gh pr create`.

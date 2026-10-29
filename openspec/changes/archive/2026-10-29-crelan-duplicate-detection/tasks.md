# Tasks

## 1. Compare payees when looking for duplicates

- [x] 1.1 Add the regression tests before the fix, and verify that they
  fail on the current code:
  - In `backend/imports/tests_bank_exports.py`, "A re-imported Crelan
    line with a counterparty": commit `CRELAN_EXPORT`, upload it again,
    and assert the Ethias line is `is_duplicate`. Also assert the
    Beheerskosten line is flagged, as before.
  - In `backend/imports/tests.py` `DuplicateDetectionTests`, "A
    re-imported CSV line with a mapped payee": an existing "Delhaize"
    -42.50 transaction with notes "Weekly shop", and a CSV with Payee and
    Description columns mapped. Assert the line is `is_duplicate`.
- [x] 1.2 In `backend/imports/utils.py:flag_duplicates`, compare
  `candidate["payee"]` with `existing.payee` instead of
  `candidate["description"]`, and update the docstring to match
  design.md. Verify that both tests from 1.1 pass, and that the rest of
  `python manage.py test imports transactions` passes unchanged (split,
  two-identical-payments, Revolut per-account and value-adjustment
  duplicate tests).

## 2. Checks

- [x] 2.1 Run the full backend suite with `python manage.py test`
  against the test database, and verify it passes.

## Workflow follow-up

- Archive the change on its branch, then open the PR with `Fixes #30`.

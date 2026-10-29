# Tasks

## 1. Corrections in the model and the schedule

- [x] 1.1 Add `accounts.LoanCorrection` (loan, date, balance_cents,
  nullable payment_cents, timestamps, unique `(loan, date)`) and
  `Transaction.loan_correction` (nullable FK, SET_NULL), with their
  migrations. Add `"accounts.LoanCorrection"` to `BACKED_UP_MODELS`.
  Verify:
  - `python manage.py makemigrations --check` is clean
  - the backup tests pass, including "every model is listed"
  - a new round-trip test covers "A correction survives"
- [x] 1.2 Teach `compute_schedule` and `schedule(loan)` the corrections,
  and add `Installment.correction_id`, as in design.md. Verify with tests
  in `transactions/tests_loans.py` for:
  - "A lower payment over the same term" (849.91 from installment 25,
    last 848.39)
  - "Paid off early"
  - "Two corrections"
  - "The bank rounds differently" (a chosen payment, with the last
    installment repaying the rest)
  - a chosen payment that ends the loan early
  - an installment on the correction's date counting as before it
  - the existing schedule tests passing unchanged

## 2. Posting, covering and reposting

- [x] 2.1 Make correction adjustments last on their date in
  `recompute_adjustments`, and clamp `_posting_date` per stretch. Verify
  with tests for "A late payment for a covered installment" (balance
  stays -170,000.00), and an installment after a correction paid on the
  correction's date (posted the next day). Also verify that the existing
  `tests_adjustments.py` pass unchanged.
- [x] 2.2 Extract `_repost(loan, today)` from `edit_loan` (line-up unless
  replaced, corrections, hand links, sync) and a `repost_effect` helper.
  Add `add_correction`, `remove_correction` and `preview_correction`, and
  have `remove_loan` clear `loan_correction`. Verify with tests for:
  - "The balance follows the bank"
  - "A correction before posted installments" (1 reposted, 1 no longer
    matching)
  - "Removing a correction"
  - "A correction survives an edit"
  - "Dates that are refused"
  - "A payment that never repays"
  - removing the setup keeping the correction's adjustment as an
    ordinary one
  - the existing edit and remove tests passing
- [x] 2.3 Add a `COVERED` state to `installment_states`, skip covered
  installments in `missed_installment`, and add
  `suggest_correction(loan, today)`. Verify with tests for:
  - "Months of missed payments"
  - "Covered by a correction" in `reports/tests_overview.py`
  - the banner amount: 693.03 found around 3 misses; none found; a single
    miss gives no suggestion
- [x] 2.4 Setup with the bank's balance: `set_up_loan` takes an optional
  bank balance and creates a correction on the setup day, and
  `_post_lineup` skips the line-up when one exists. The setup preview
  checks the corrected payment. Verify with tests for "Set up with the
  bank's balance" and "Setting up with the bank's balance".

## 3. API

- [x] 3.1 In `accounts/views.py`, add the endpoints: correction preview
  (including the near payment within 0.05), add, and remove with its
  preview. Extend the schedule body with `corrections`, the payment in
  force, `payment_since`, `paid_off_on`, `suggestion` and each
  installment's `correction_id` and covered state. Add the optional bank
  balance to setup and its preview. Verify with API tests in
  `accounts/tests_loans.py` for each endpoint's success and rejection,
  and for "Checking a correction" and "A cent off".

## 4. Schedule page

- [ ] 4.1 Add the API functions in `frontend/src/api/loans.js`. On
  `LoanSchedulePage`, add:
  - the `[Correct balance] [Edit]` header group
  - the header line with "since" and "Paid off"
  - the inline "Correct the balance" form, with a shared `CheckPanel`,
    the "Pay a different amount?" override and the near-payment offer

  Verify with `LoanSchedulePage.test.jsx` cases for "After a
  correction", "Paid off", the form preview, the override and "A cent
  off".
- [ ] 4.2 Add the correction row (desktop and phone), the "payment €X"
  line on the first installment after a correction, no state on covered
  installments, the remove dialog, the banner, and `scheduleWindow`
  keeping the latest correction in view. Verify with tests for "A
  correction row", "Removing a correction", the three banner scenarios
  and `lib/loans.test.js` for the window. Check the page at 390px for "A
  correction row on a phone".
- [ ] 4.3 The setup form's "The bank says something else" field, and the
  link to it from the no-payment warning. Verify with a test for
  "Setting up with the bank's balance".

## 5. Checks

- [ ] 5.1 Run `npm test`, `npm run lint` and `npm run build` in
  `frontend/`, and `python manage.py test` in `backend/`, and verify all
  pass. Then set up the household mortgage (160,000.00 from November
  2014, 300 months) with today's bank balance on a dev copy, and verify
  the schedule shows 693.03 and matches the recent payments.

## Workflow follow-up

- Archive the change on its branch, then open the PR.

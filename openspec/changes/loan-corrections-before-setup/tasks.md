# Tasks

## 1. Backend

- [x] 1.1 In `transactions/loans.py`:
  - allow correction dates from one month before the setup day
  - skip `_post_correction` for corrections before setup
  - pass corrections to `lineup_value` from `_post_lineup`, `preview`
    and `preview_correction`
  - add `bank_balance_date` to `set_up_loan` and `preview`

  Verify with tests in `transactions/tests_loans.py` for "The bank's
  figure from before the latest installment", "A correction before the
  setup day" (line-up -91,303.56, payment 693.03), "A correction the day
  before setup", and "Dates that are refused" (more than a month before),
  and that the existing loan tests still pass.
- [x] 1.2 Accept an optional `bank_balance_date` on setup and its preview
  in `accounts/views.py`. Verify with an API test for "Setting up with the
  bank's figure from before an installment".

## 2. Frontend

- [ ] 2.1 On `LoanSchedulePage`, add a date beside the setup form's "Owed
  per the bank" (default today, earliest one month back), and set the
  correction form's earliest date to one month before the setup day.
  Verify with page tests that the date is sent to the preview and to
  setup.

## 3. Checks

- [ ] 3.1 Run `npm test`, `npm run lint` and `npm run build` in
  `frontend/`, and `python manage.py test` in `backend/`, and verify all
  pass.

## Workflow follow-up

- Archive the change on its branch, then open the PR with `Fixes #34`.

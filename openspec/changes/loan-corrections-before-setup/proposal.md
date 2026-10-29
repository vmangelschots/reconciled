# Proposal

Issue: #34

## Why

Banks often update a loan's balance a few days after the installment
leaves the paying account, so the balance they show is from before the
latest installment. Setting up the household mortgage on 29 October with
the bank's 91,786.35, a figure from before the 28 October installment,
is impossible today. A correction can't be dated before the setup day,
and dated on the setup day it gives 696.70 instead of the bank's 693.03.
The correction form's own hint tells the user to pick a day before the
installment, which the form then refuses.

## What Changes

- A correction may be dated up to one month before the setup day, so the
  bank's figure from before the latest installment fits.
- A correction dated before the setup day only shapes the schedule. It
  posts no adjustment of its own. The setup-day line-up takes its value
  from the corrected schedule, which also covers the installments
  between the correction and the setup day.
- The setup form's "The bank says something else" field gets a date,
  defaulting to today, with the same bounds.

Out of scope: corrections more than a month before setup, and posting
installments from before setup one by one.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loan-schedules`:
  - "Correct a loan's balance": the date can be up to one month before
    the setup day
  - "A correction sets the loan's balance": a correction before setup
    posts no adjustment of its own
  - "Line up at setup": the line-up follows corrections before it
  - "Check the terms before saving": the bank's balance at setup has a
    date

## Impact

- `backend/transactions/loans.py`:
  - the date check
  - `lineup_value` takes corrections into account
  - posting skips corrections before setup
  - `set_up_loan` and `preview` take the bank balance's date
- `backend/accounts/views.py`: an optional `bank_balance_date` on setup
  and its preview.
- `frontend/src/pages/LoanSchedulePage.jsx`:
  - the correction form's earliest date
  - a date next to the setup form's bank balance

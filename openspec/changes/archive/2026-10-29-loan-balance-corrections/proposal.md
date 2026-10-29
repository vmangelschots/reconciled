# Proposal

Issue: #32

## Why

A loan's schedule is computed once from its terms, so it can only follow
a loan that never deviates from them. Real loans do. A partial early
repayment lowers the balance, and the bank then recomputes the
installment over the months that are left. The household's own mortgage
(160,000 from November 2014, 300 months) went from 737.99 to 693.03 a
month after an extra repayment the bank demanded when they bought a new
house. Since then the app's schedule expects the wrong payment, so no
payment ever matches and every month shows as missed. Set value is no
way out either, because a loan with a setup doesn't offer it: the next
installment would overwrite it.

The user doesn't need to know when or how much was repaid extra. The
bank's statement says what is owed today, so the schedule should be able
to start again from that amount.

## What Changes

- **Correct the balance.** On a loan's schedule page, the user can enter
  what the bank says is owed on a date (today by default). This is a
  balance correction. From the next installment on, the schedule runs
  from that balance, at the same rate, to the same end date, with a newly
  computed payment.
- **The payment the bank asks.** The correction form shows the payment it
  computes and lets the user replace it with the amount actually paid, so
  a cent of rounding difference between the bank and the app can't stop
  every payment from matching. The last installment absorbs the
  difference.
- **The balance follows.** A correction posts a value adjustment on the
  loan, dated on the correction, holding the corrected amount, as the
  line-up does at setup. Installments after it that were already posted
  are reposted from the new schedule, with the same warning an edit of
  the terms gives.
- **On the page.** The schedule table shows a correction as a marked row
  between the installments it falls between. The header's monthly
  payment is the one in force now. A correction can be removed, which
  reposts as before it.
- **Several corrections.** Each correction starts a new stretch, so a
  later extra repayment is handled the same way. A balance of 0.00 marks
  the loan as paid off.
- **The correction covers what came before.** An installment dated on or
  before a correction that has no payment is no longer "Missed". The
  bank's figure already accounts for it. If its payment turns up later,
  it is still matched, without moving the balance away from the
  correction.
- **Finding it.**
  - The schedule header gets "Correct balance" next to Edit.
  - When the last installments were missed, a banner above the table
    suggests a correction. If the paying account paid one other amount
    around those dates, the banner names it and the form opens with that
    payment filled in.
  - Setting up a loan that has been running a while can take the bank's
    balance straight away. The setup form's "owed today" line accepts
    what the bank says, which saves the setup with a correction on the
    setup day. That is this household's case: 160,000 from 2014,
    corrected to today's balance in one step.
- **Backups** hold balance corrections.

Out of scope:
- Shortening the term instead of lowering the payment.
- The bank's reinvestment fee (*wederbeleggingsvergoeding*). It is an
  ordinary transaction in the paying account.
- Rate revisions. A later change could add a rate to a correction.
- Entering the rate as a monthly rate.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `loan-schedules`:
  - new requirements for entering, applying, showing, suggesting and
    removing balance corrections
  - "Check the terms before saving": the bank's balance at setup
  - "Line up at setup": a correction on the setup day takes its place
  - "Edit a loan setup": an edit keeps the corrections
  - "Schedule page": the header shows the payment in force
  - "Schedule table": corrections show as rows, and covered installments
    show no state
- `overview`: a missed loan payment covered by a correction isn't listed.
- `data-backup`: a backup holds balance corrections.

## Impact

- Backend:
  - `accounts`: a `LoanCorrection` model (loan, date, balance, optional
    payment), with a migration, added to the backup's models
  - `transactions/loans.py`:
    - `schedule()` applies corrections
    - posting and reposting a correction's adjustment
    - preview of a correction
  - `accounts/views.py`: endpoints to preview, add and remove a
    correction, and corrections in the schedule body
- Frontend: on `LoanSchedulePage`:
  - the "Correct balance" action and inline form
  - the missed-payments banner
  - the bank's balance in the setup form
  - correction rows in the table and the phone list
  - the header payment
- No change to forecasting code. It follows `schedule()`, so it picks up
  corrections automatically.

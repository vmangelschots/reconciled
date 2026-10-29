# Proposal

Issue: #25

## Why

A Belgian mortgage is an annuity loan: a fixed monthly payment where the
interest share starts high and the principal share grows. Since #24 the
loan account's balance is updated by hand with Set value, so it drifts
between updates and net worth is only right right after the user fixes
it. The app knows everything needed to keep the loan right on its own:
the loan's terms and the payment it sees leaving checking.

## What Changes

- **Loan setup.** A loan account can be given its terms:
  - amount borrowed
  - annual rate
  - term in months
  - date of the first installment, from the bank's repayment table
  - the account it is paid from
  - optionally, the category for the payment

  Rate revisions and extra repayments are left for later.

  While the user types, the form checks the terms against reality: it
  shows the monthly payment, the next installment, the schedule's
  balance today next to the loan's balance, and the payments of that
  amount found in the paying account over the last 90 days, or a warning
  that there are none. A cent off would otherwise mean every month is
  missed, and this is where the user notices.
- **Schedule page.** The ledger header of a loan without a setup offers
  "Set value" and "Set up schedule". With a setup, it offers only
  "Schedule", because a value set by hand would be overwritten by the
  next installment.
- **Amortization schedule.** From the terms the app computes the
  aflossingstabel the Belgian way: the monthly rate is the equivalent
  rate `(1+r)^(1/12) - 1`, not `r / 12`. Amounts are rounded to the cent
  each month, and the last payment absorbs what rounding leaves. Every
  installment falls on the first payment's day of the month, or the last
  day of shorter months. The loan account shows the full table: date,
  payment, interest, principal and balance after, with each installment
  shown as posted, due or missed. On a phone each installment is a
  two-line row. The page opens on the last two posted installments, the
  current one and the next twelve, with the rest behind "Show earlier"
  and "Show all". It reads "€199,549 still owed" above a line with the
  terms.
- **Lining up at setup.** Setting up posts one value adjustment on the
  setup date, set to the schedule's balance after the installments due
  before it. Earlier installments are never posted one by one.
- **Payments are matched, then posted.** For each installment due since
  setup, the app looks in the paying account for the payment: the exact
  installment amount going out, within 5 days of its date.
  - When it finds the payment, it posts a value adjustment on the loan,
    dated on the payment and set to the installment's balance after, and
    links the two. Net worth then drops only by the interest.
  - A matched payment with no category, or only an unconfirmed guess,
    gets the setup's payment category.
  - The payment stays a normal expense, so the budget sees the full
    amount. It is tagged with its loan and installment in the ledger,
    linking to the schedule. The adjustment shows "Installment 24 of
    300" in place of a category.

  Matching happens whenever the app reads the loan, the overview or the
  ledger, and after an import, so there is no background job.
- **Link a payment by hand.** An unmatched installment offers "Link
  payment", listing nearby outflows in any non-loan account, closest
  amount first. This covers a payment booked late, paid from another
  account, or off by a cent. A link made by hand can be undone, and it
  survives later edits to the payment's amount.
- **Scheduled adjustments belong to the schedule.** They can't be deleted
  or replaced by hand:
  - Deleting the matched payment, or changing the amount of an
    automatic match, removes its adjustment, and the installment is
    unmatched again.
  - Changing the amount, rate, term or first installment reposts
    everything from the new schedule, after telling the user how many
    payments will no longer match. Changing only the category or the
    paying account keeps every match.
  - Removing the setup, after confirming, keeps the posted adjustments
    as ordinary ones.
- **A scheduled loan isn't a transfer target from its paying account.**
  Otherwise its principal would be counted twice.
- **A missed payment needs attention.** When an installment's payment
  hasn't been seen 5 days after its date, and no later installment has
  matched since, the overview's Needs attention lists it, linking to the
  loan's schedule. A second line names the installment, its amount and
  the paying account, so two loans paid from one account can be told
  apart.
- **The loan's forecast follows its schedule.** The forecast of a loan
  with a setup takes the schedule's balance on each future installment
  date.

Not in scope:
- Rate revisions (variable 5/5/5, 10/5/5 loans) and extra or early
  repayments.
- A net-worth projection across accounts. It gets its own issue.
- Creating a recurring transaction for the payment on the paying account.
- Posting installments from before setup one by one.
- Loans that aren't annuities, such as fixed-principal or bullet loans.

## Capabilities

### New Capabilities
- `loan-schedules`:
  - setting up, editing and removing a loan's terms
  - computing the annuity schedule
  - lining up at setup
  - checking the terms before saving
  - matching payments, linking them by hand, and posting scheduled
    adjustments
  - tagging matched payments
  - the schedule page and table

### Modified Capabilities
- `value-adjustments`:
  - scheduled adjustments can't be deleted and show their installment
  - Set value can't replace one on its date, and isn't offered on a loan
    with a setup
- `overview`: Needs attention lists a missed loan payment, before the
  stale import line.
- `forecasting`: a loan with a setup is projected along its schedule.
- `account-transfers`: a loan with a setup isn't a transfer target from
  its paying account.
- `data-backup`: a backup holds loan setups and the links between
  scheduled adjustments and their payments.

## Impact

- Backend:
  - `accounts`: a `Loan` model, one-to-one with a loan account, holding
    its terms (migration)
  - `transactions`:
    - `Transaction` fields linking a scheduled adjustment to its loan,
      installment and payment (migration)
    - a `loans.py` module for the schedule, the setup, matching and
      reposting
    - delete, set-value and transfer-target guards
    - re-running the match after imports and on reads
  - endpoints to read, preview, set up, edit and remove a loan's
    schedule, and to list, link and unlink an installment's payment
  - `reports`: the overview runs the match and adds missed payments to
    its attention data
  - `forecasting`: `generate_forecast` follows the schedule for a loan
    with a setup
  - `backup`: the new model in `BACKED_UP_MODELS`
- Frontend:
  - a loan schedule page for loan accounts, with the checked setup
    form, the header, the table and "Link payment"
  - the ledger header buttons, the scheduled adjustment row without
    Delete, and the tag on a matched payment
  - no scheduled loan in its payer's transfer targets
  - the missed-payment item in Needs attention, with its second line
- No new dependencies.

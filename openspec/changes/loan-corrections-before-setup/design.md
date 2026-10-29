# Design

## Context

A correction posts its own adjustment on its date, and the setup-day
line-up holds `lineup_value`: the balance after the last installment
before the setup day. An adjustment dated before the line-up would be
overwritten by it, which is why corrections were bounded by the setup
day. See proposal.md for why that bound is too strict.

## Decisions

### A correction before setup shapes the schedule, the line-up posts it
`_post_correction` is skipped for a correction dated before
`loan.setup_date`. The line-up already reflects it:

- `compute_schedule` already restarts at the first installment after
  the correction.
- `lineup_value(installments, principal, setup_date, corrections)`
  takes the later of two things: the last installment dated before the
  setup day, and the last correction dated before it. On a tie the
  correction wins, because an installment on a correction's date counts
  as before it.

For the household mortgage, 91,786.35 on 27 October restarts installment
143 on 28 October at 693.03, so the line-up on 29 October holds its
balance after, 91,303.56.

Alternative considered: post the correction's adjustment before the
line-up and let the line-up skip itself. Rejected, because the 28 October
installment between them would then not be reflected. The line-up is the
one place that sums up everything before setup.

### One month back
`_check_correction` bounds the date at `setup_date - relativedelta(months=1)`.
That is one installment period, which is enough for a bank that lags a
few days. It also keeps a correction from rewriting history that was
already lined up. The message: "The date can't be more than a month
before the setup day (29 Sep 2026). Edit the terms instead."

### Setup takes the bank balance's date
`set_up_loan` and `preview` gain `bank_balance_date` (default `today`),
checked against the same bound. The API field is optional, so existing
clients keep working. In the setup form, the "Owed per the bank" input
gets a date input beside it, defaulting to today.

### Unchanged
Covered installments, the posting clamp and reposting already handle a
correction of any date. `_repost` only needs the skip from the first
decision, and `preview()` passes the corrections to `lineup_value`, so
"Owed today per schedule" agrees with the line-up.

## Risks / Trade-offs

- [A correction before setup shows no adjustment row of its own in the
  ledger] → The schedule shows its correction row next to the
  installments before setup, and the line-up carries its effect.

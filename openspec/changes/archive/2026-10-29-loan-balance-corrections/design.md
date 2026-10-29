# Design

## Context

`transactions/loans.py` computes a loan's schedule from its terms with
`compute_schedule()`. Matching (`sync_loan`), the page's states, Needs
attention (`missed_installment`), the setup preview and the forecast
(`forecasting/utils.py`) all read `schedule(loan)`. What is stored is the
adjustments: the line-up (`loan_installment=0`) and one per matched
installment, each holding an absolute balance.

`recompute_adjustments` orders a loan account's adjustments by
`(date, id)`. When two adjustments share a date, the later id sets the
end-of-day balance. The mortgage-schedule design kept terms in their own
model so revisions could be added as more rows. Corrections are those
rows.

## Goals / Non-Goals

**Goals:**
- The schedule stays a pure function, now of the terms plus the
  corrections, so the forecast, matching and states follow without their
  own rules.
- A correction's balance holds on its day, whatever installment is
  matched later.

**Non-Goals:**
- Storing the bank's own table, or reconciling interest and principal
  per installment. Only the balance and the payment are corrected.

## Decisions

### `accounts.LoanCorrection` rows
- `loan`: FK, CASCADE
- `date`
- `balance_cents`: what is owed, 0 or more
- `payment_cents`: nullable. The chosen payment; null means computed.
- created and updated times
- unique on `(loan, date)`

A correction's adjustment links to it through a new nullable
`Transaction.loan_correction` FK with `on_delete=SET_NULL`, plus `loan`
set and `loan_installment` null. The existing unique `(loan,
loan_installment)` constraint ignores nulls in Postgres, so it doesn't
collide.

`remove_loan` already turns scheduled adjustments into ordinary ones. It
also clears `loan_correction` before the loan cascades away, so the
balance doesn't move. Removing a single correction deletes its
adjustment explicitly.

Alternatives considered:
- *Store corrections as a JSON list on `Loan`.* Rejected: no adjustment
  link, and backups and constraints get harder.
- *Model an extra repayment (date, amount) instead.* Rejected in
  exploration: the user doesn't know those figures, but the bank shows
  the balance.

### `compute_schedule` walks segments
`compute_schedule(principal, rate, term, first, corrections=())` keeps
its loop. Before each installment it checks whether a correction now
lies between the previous installment's date (exclusive) and this one's
(exclusive of later corrections). If one does, it sets
`balance = correction.balance_cents` and computes the payment:

- the correction's chosen `payment_cents`, or
- the annuity of the balance over `term - (number - 1)` installments.

When several corrections fall between two installments, the latest one
wins. An installment on a correction's date counts as before it (the
check is `correction.date < installment.date`). A balance of 0 ends the
loop. With a chosen payment, `principal = min(payment - interest,
balance)`, and the loop stops once the balance reaches 0, so a generous
payment ends the loan early rather than going negative. The term's last
installment repays whatever is left, as today.

`Installment` gains `correction_id`: the correction its stretch started
from, or None. The page uses it to put "payment €X" on the first
installment after a correction. The preview of a correction calls the
same function with the candidate added, so the form and the saved
schedule can't disagree.

### Corrections win on their day; installments after them start the next day
Two rules keep a correction's balance in place:

1. `recompute_adjustments` orders by
   `("date", loan_correction_id IS NOT NULL, "id")`, implemented as an
   ordering on `F("loan_correction").asc(nulls_first=True)`. A
   correction is therefore the last adjustment on its date, and its value
   is the end-of-day balance.
2. `_posting_date` clamps per stretch. An installment dated on or before
   a correction posts no later than that correction's date, so a late
   payment for a covered installment lands before the correction and
   can't move the balance. An installment after a correction posts no
   earlier than the day after it, the same idea as the existing
   `max(payment.date, setup_date)`.

This is why covered installments can still be matched. The spec lets a
late payment be tagged, and these rules keep the balance on the bank's
figure.

Alternative considered: never match covered installments. Rejected,
because a repost (edit or removal) deletes automatic matches and would
then fail to rematch the installments before a correction. That would
silently lose history.

### A correction on the setup day replaces the line-up
`_post_lineup` skips the line-up when a correction exists on
`setup_date`; the correction's adjustment holds that day's value.
Removing that correction reposts, and the line-up comes back. The setup
endpoint takes an optional `bank_balance_cents`. In one transaction, it
creates the loan and a correction on today, then syncs.

### One repost routine
`edit_loan` already reposts. That logic becomes `_repost(loan, today)`,
shared by edit, adding a correction and removing one:

1. Delete the automatic installment adjustments.
2. Post the line-up, unless it is replaced.
3. Post each correction's adjustment.
4. Update the hand-linked adjustments to their new balances.
5. Run `sync_loan`.

The repost counts in the previews come from one helper,
`repost_effect(loan, installments)`, which `preview()` already half has.

### Covered is a state, not stored
`installment_states` gains `COVERED`: an installment with no adjustment,
dated on or after setup and on or before the latest correction.
`missed_installment` skips covered installments. Nothing new is stored.

### The banner's amount is computed on read
`suggest_correction(loan, today)`:
- takes the trailing run of MISSED installments (2 or more),
- collects the paying account's outflows within `MATCH_DAYS` of each,
  through `payment_rows()`,
- returns the most common amount that occurs at 2 or more distinct
  installments, if any.

The schedule body carries `{missed_count, amount_cents | null}`. The UX
review recommended one banner over hints on each row.

### API
On the loan resource, next to the existing preview, setup, edit and
remove endpoints:
- `POST …/loan/corrections/preview`: the payment, the payment before it,
  installments left, end date, the difference from the schedule, the
  payments found, a near payment within 5 cents, and the repost effect
- `POST …/loan/corrections`
- `DELETE …/loan/corrections/<id>`: the confirm dialog gets its text
  from the preview of the removal, using the same helper
- the schedule body gains `corrections`, `payment_cents` (in force),
  `payment_since`, `paid_off_on` and `suggestion`

### UI (from the UI and UX review)
- **Header:** `[Correct balance] [Edit]`, both `outline sm`. Both hide
  while either form is open.
- **Form:** an inline Panel titled "Correct the balance", in the place
  where the edit form renders.
  - Date (default today) and "Owed per the bank" with a `€` adornment.
  - The hint: "Date it on the day of that balance. If the bank hasn't
    deducted the latest installment yet, pick a day before it."
  - The check panel reuses the `TermsCheck` shell. A shared `CheckPanel`
    wrapper is extracted for both forms.
  - The override is a quiet "Pay a different amount?" link. It turns the
    payment into an inline input with "Use computed €X".
  - The near-payment offer is a one-click text button.
- **Setup form:** a "The bank says something else" link under the "Owed
  today" line opens "Owed per the bank". The warning shown when no
  payment was found links to it too.
- **Correction row:** a full `ROW_GRID` row with `bg-accent/5` and the
  `Scale` icon.
  - It reads "Balance corrected" and "€X → €Y a month", with the owed
    amount in the balance column.
  - Remove (ghost, `hover:text-critical`) opens a dialog cloned from
    RemoveDialog.
  - On a phone: "⚖ 14 Mar · Corrected" with the amount, and the change
    plus Remove on the second line.
- **Banner:** a warning-tinted strip at the top of the schedule Panel,
  with its "Correct balance" button.
- **Window:** `scheduleWindow` keeps the latest correction row in view.

## Risks / Trade-offs

- [Changing how `recompute_adjustments` orders could affect non-loan
  accounts] → The extra key only orders correction adjustments, which
  exist only on loans. Every other account sorts as before. A test pins
  this.
- [A chosen payment too high ends the loan early, earlier than the end
  date the bank states] → The preview shows the end date, so the user
  sees it before saving.
- [The banner amount could be a coincidence, such as another recurring
  bill near the same dates] → It needs at least 2 hits and is only a
  suggestion, prefilled in a form the user checks.
- [Floating-point drift between the preview and the save] → Both run
  `compute_schedule` with `Decimal` on the same inputs.

## Migration Plan

Two migrations:
- `accounts`: `LoanCorrection`
- `transactions`: `Transaction.loan_correction`

Add `"accounts.LoanCorrection"` to `BACKED_UP_MODELS`. Existing loans
have no corrections, so their schedules don't change. To roll back,
remove the corrections first; their adjustments then become ordinary.

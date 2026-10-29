# Spec Delta

## ADDED Requirements

### Requirement: Correct a loan's balance
A loan with a setup SHALL let the user record a balance correction: a
date and the amount the bank says is still owed at the end of that day.
The date SHALL be no earlier than the setup day and no later than today.
There SHALL be at most one correction per date. The amount SHALL be 0.00
or more.

#### Scenario: The bank's figure after an extra repayment
- **WHEN** on 12 November 2026 the user corrects "Mortgage" to 170,000.00
  owed on 12 November 2026
- **THEN** "Mortgage" has a correction on 12 November 2026 of 170,000.00

#### Scenario: Dates that are refused
- **WHEN** the user enters a correction dated tomorrow, dated before the
  setup day, or on a date that already has a correction
- **THEN** the correction is rejected with a message saying why, and
  nothing changes

### Requirement: The schedule restarts from a correction
After a correction, the next installment and those after it SHALL run
from the corrected amount, at the loan's rate, keeping their numbers and
dates. Their payment SHALL be the annuity that repays the corrected
amount over the installments left. An installment dated on the
correction's date SHALL count as before it. A correction of 0.00 SHALL
end the schedule: no installments follow it.

#### Scenario: A lower payment over the same term
- **WHEN** "Mortgage" (200,000.00 at 3.00% over 300 months from 2
  December 2024, 944.22 a month) is corrected to 170,000.00 on 12
  November 2026
- **THEN** installments 1 to 24 stay at 944.22, and installments 25 (2
  December 2026) to 300 (2 November 2049) are 849.91, the last one
  848.39, leaving 0.00

#### Scenario: Paid off early
- **WHEN** a loan is corrected to 0.00 on 12 November 2026
- **THEN** the schedule has no installments after 12 November 2026

#### Scenario: Two corrections
- **WHEN** a loan has corrections on 12 November 2026 and 3 March 2028
- **THEN** installments after 3 March 2028 run from the 3 March 2028
  amount, and those between the two from the 12 November 2026 amount

### Requirement: Choose the payment after a correction
The correction form SHALL let the user replace the computed payment with
the amount the bank actually takes. That payment SHALL apply to every
installment after the correction except the last, which SHALL repay what
is left. A payment no greater than the first installment's interest
SHALL be rejected.

#### Scenario: The bank rounds differently
- **WHEN** the computed payment is 693.04 and the user sets it to 693.03
- **THEN** the installments after the correction are 693.03, the last one
  repays what is left, and payments of -693.03 match

#### Scenario: A payment that never repays
- **WHEN** the first installment after a correction has 240.00 interest
  and the user sets the payment to 200.00
- **THEN** the correction is rejected with a message giving the lowest
  payment allowed

### Requirement: Check a correction before saving
While the user enters a correction, the form SHALL show, before anything
is saved: the payment from the next installment on, with the payment
before it; the number of installments left and the end date; how much
the amount differs from the schedule's balance on that date; the
payments of the new payment found in the paying account in the last 90
days, or a warning that none were found; and how many posted
installments will be reposted and how many matched payments will no
longer match.

#### Scenario: Checking a correction
- **WHEN** on 12 November 2026 the user enters 170,000.00 owed on 12
  November 2026 for "Mortgage", whose schedule has 188,864.23 after
  installment 24
- **THEN** the form shows "€849.91 a month from 2 Dec 2026", "was
  €944.22", 276 installments left ending Nov 2049, "€18,864.23 less than
  the schedule", and the payments of -849.91 found in "Crelan" or a
  warning that none were found

### Requirement: Offer the amount the bank paid
When the correction form finds no payment of its payment in the paying
account in the last 90 days, but finds one within 0.05 of it, the form
SHALL offer to use that amount as the payment.

#### Scenario: A cent off
- **WHEN** the computed payment is 693.04, no -693.04 was found in
  "Crelan", and "Crelan" paid -693.03 on 28 October
- **THEN** the form offers "Crelan paid €693.03 on 28 Oct. Use €693.03",
  and choosing it sets the payment to 693.03

### Requirement: A correction sets the loan's balance
Saving a correction SHALL post a value adjustment on the loan account,
dated on the correction, set to minus the corrected amount. Installments
after the correction that were posted SHALL be reposted from the new
schedule, as an edit of the terms reposts them.

#### Scenario: The balance follows the bank
- **WHEN** "Mortgage" stands at -188,864.23 and is corrected to
  170,000.00 on 12 November 2026
- **THEN** "Mortgage" gets a value adjustment dated 12 November 2026 set
  to -170,000.00, and its balance is -170,000.00

#### Scenario: A correction before posted installments
- **WHEN** installment 25 was posted with a -944.22 payment, and the user
  adds a correction dated before it
- **THEN** before saving the form says 1 installment will be reposted and
  1 payment will no longer match, and after saving installment 25 is
  unmatched

### Requirement: A correction covers what came before
An installment dated on or before a correction, and after the setup day
or the correction before it, that has no matched payment SHALL be
covered by the correction. A covered installment SHALL NOT be missed.
It SHALL still be matched or linked when its payment turns up, but that
SHALL NOT change the loan's balance from the correction's.

#### Scenario: Months of missed payments
- **WHEN** installments 2 to 7 of a loan were missed because the bank
  changed the payment, and the user corrects the balance on the day after
  installment 7
- **THEN** installments 2 to 7 show no state, and the loan isn't listed
  in Needs attention

#### Scenario: A late payment for a covered installment
- **WHEN** the 2 November installment is covered by a correction to
  170,000.00 on 3 November, and its -944.22 payment dated 4 November is
  imported afterwards
- **THEN** the installment is posted with that payment, and the loan's
  balance after 4 November is still -170,000.00

### Requirement: Remove a correction
The user SHALL be able to remove a correction after confirming. The
confirmation SHALL say what the payment goes back to, and how many
installments will be reposted and how many payments will no longer
match. Removing SHALL remove its adjustment and repost the schedule as
it was without the correction.

#### Scenario: Removing a correction
- **WHEN** the user removes the 12 November 2026 correction of "Mortgage"
  and confirms
- **THEN** the confirmation said the payment goes back to €944.22 from 2
  Dec, the correction's adjustment is gone, and installments after it
  are back at 944.22

### Requirement: Suggest a correction when payments are missed
When the last two or more installments since the setup day are missed,
the schedule page SHALL show a banner above the table suggesting a
correction, with a "Correct balance" button. When the paying account has
one other outflow amount at least twice within 5 days of those
installments, the banner SHALL name that amount, and the correction form
SHALL open with it as the payment.

#### Scenario: The bank changed the payment
- **WHEN** installments of 737.99 on 28 August, 28 September and 28
  October were missed, and "Crelan" paid -693.03 on 28 August, 29
  September and 28 October
- **THEN** the banner reads "The last 3 installments were missed. Crelan
  paid €693.03 around each date. Did the bank change the payment?", and
  "Correct balance" opens the form with 693.03 as the payment

#### Scenario: No other amount found
- **WHEN** the last 2 installments were missed and "Crelan" shows no
  repeated other amount near them
- **THEN** the banner reads "The last 2 installments were missed. If you
  repaid extra and the bank changed the payment, correct the balance."

#### Scenario: One miss isn't a pattern
- **WHEN** only the latest installment was missed
- **THEN** no banner is shown

## MODIFIED Requirements

### Requirement: Check the terms before saving
While the user enters or edits the terms, the form SHALL show, before
anything is saved: the monthly payment; the next installment's number
and date; the schedule's balance today next to the loan's current
balance; and the payments of that amount found in the paying account in
the last 90 days, or a warning that none were found. The term SHALL be
shown in months and years, and the date field SHALL be labelled as the
first installment from the repayment table. When setting up a loan, the
form SHALL also accept what the bank says is owed today; the setup is
then saved with a correction of that amount on the setup day, and the
form checks the payment that correction gives instead.

#### Scenario: Terms that match the bank
- **WHEN** on 12 November 2026 the user enters 200,000.00 at 3.00% over
  300 months from 2 December 2024, paid from "Crelan", which has -944.22
  on 2 November, 2 October and 2 September
- **THEN** the form shows "€944.22 a month", "300 months (25 years)",
  the next installment 25 of 300 on 2 December 2026, the schedule's
  balance today next to "Mortgage"'s balance, and the three payments
  found in "Crelan"

#### Scenario: Terms that don't match
- **WHEN** the entered terms give 944.22 and "Crelan" has no -944.22 in
  the last 90 days
- **THEN** the form warns that no payment of €944.22 was found in
  "Crelan" and suggests checking the terms against the bank's repayment
  table, or entering what the bank says is owed, and still allows saving

#### Scenario: Setting up with the bank's balance
- **WHEN** the user sets up 160,000.00 over 300 months from November
  2014, and enters that the bank says 104,870.35 is owed today
- **THEN** the form shows the payment computed from 104,870.35 over the
  installments left, checks that payment in the paying account, and
  saving creates the setup with a correction of 104,870.35 on the setup
  day

### Requirement: Line up at setup
Setting up a loan SHALL post a value adjustment on the loan account dated
the setup day, set to minus the schedule's balance after the last
installment dated before that day, or minus the amount borrowed if none
is. Installments dated before the setup day SHALL NOT be posted
separately. When the loan has a correction on the setup day, that
correction's adjustment SHALL take the line-up's place.

#### Scenario: A loan running for a while
- **WHEN** on 15 February 2027 the user sets up a loan of 1,000.00 at
  6.00% over 3 months with its first installment on 31 January 2027
- **THEN** a value adjustment dated 15 February 2027 set to -668.29 is
  posted, and the 31 January installment is not posted on its own

#### Scenario: A new loan
- **WHEN** on 20 November 2026 the user sets up a loan of 200,000.00
  whose first installment is on 2 December 2026
- **THEN** a value adjustment dated 20 November 2026 set to -200,000.00
  is posted

#### Scenario: Set up with the bank's balance
- **WHEN** a loan is set up on 29 October 2026 with a correction of
  104,870.35 on that day
- **THEN** its only adjustment on 29 October 2026 is set to -104,870.35,
  and removing the correction brings back the line-up from the schedule

### Requirement: Edit a loan setup
The user SHALL be able to edit a loan's setup. Changing only the payment
category or the paying account SHALL keep every match. Changing the
amount, rate, term or first installment SHALL first say how many
installments will be reposted and how many matched payments will no
longer match, then remove every scheduled adjustment and repost them from
the new schedule: the line-up on the original setup day, then each
correction, then a match for each installment since.
Corrections SHALL be kept with their amounts and chosen payments.
Payments linked by hand SHALL stay linked.

#### Scenario: Correcting the rate
- **WHEN** the user changes the rate of a set-up loan from 3.00% to 2.90%
- **THEN** before saving the form says how many installments will be
  reposted and how many payments will no longer match, and after saving
  the line-up and each matched installment's adjustment are set to the
  new schedule's balances

#### Scenario: Changing the category
- **WHEN** the user changes only the payment category
- **THEN** no installment is reposted and the existing matches stay

#### Scenario: A correction survives an edit
- **WHEN** "Mortgage" has a correction to 170,000.00 on 12 November 2026
  and the user changes the rate
- **THEN** the correction's adjustment is still -170,000.00 on 12
  November 2026, and the installments after it are recomputed at the
  new rate

### Requirement: Schedule page
A loan account SHALL have a schedule page, reached from its ledger
header. With a setup, the page SHALL show how much is still owed, and a
line with the amount borrowed, rate, term, monthly payment in force,
paying account and end date, with "Correct balance" and Edit controls.
When a correction changed the payment, the line SHALL say since when.
A loan corrected to 0.00 SHALL read as paid off on that date. Without a
setup, the page SHALL offer to set up the loan.

#### Scenario: The header
- **WHEN** "Mortgage" owes 199,549.03 on a 200,000.00 loan at 3.00% over
  300 months paid from "Crelan" ending November 2049
- **THEN** the page reads "€199,549 still owed" and "€200,000 at 3.00%
  over 25 years · €944.22 a month from Crelan · ends Nov 2049"

#### Scenario: After a correction
- **WHEN** "Mortgage" was corrected to 170,000.00 on 12 November 2026
- **THEN** the line reads "€200,000 at 3.00% over 25 years · €849.91 a
  month from Crelan since Dec 2026 · ends Nov 2049"

#### Scenario: Paid off
- **WHEN** "Mortgage" was corrected to 0.00 on 12 November 2026
- **THEN** the page reads "Paid off 12 Nov 2026"

#### Scenario: A loan without a setup
- **WHEN** the user opens the schedule of a loan account with no setup
- **THEN** the page offers to set up the loan

### Requirement: Schedule table
The schedule SHALL list each installment's date, interest, principal and
balance after; the last installment SHALL show its own payment, and so
SHALL the first installment after a correction. State SHALL show only
for: posted installments ("Posted" and the payment's date), the first
unmatched installment not yet 5 days past its date ("Due"), and
unmatched ones more than 5 days past it ("Missed", in the warning
colour). Covered installments SHALL show no state. Installments before
setup SHALL be collapsed behind a divider naming the setup day. Each
correction SHALL show as a row at its date, with the amount owed in the
balance column, the payment before and after it, and "Remove".

#### Scenario: States in the table
- **WHEN** today is 12 November, the setup was on 20 October, the 2
  November installment was matched on 4 November and the 2 December one
  is ahead
- **THEN** the installments before 20 October are collapsed behind "Set
  up 20 Oct", 2 November reads "Posted 4 Nov", 2 December reads "Due",
  and later installments show no state

#### Scenario: A missed installment
- **WHEN** today is 12 November and the 2 November installment has no
  match
- **THEN** it reads "Missed" in the warning colour and offers "Link
  payment"

#### Scenario: A correction row
- **WHEN** "Mortgage" was corrected to 170,000.00 on 12 November 2026
- **THEN** a row dated 12 Nov reads "Balance corrected" with "€944.22 →
  €849.91 a month" and 170,000.00 in the balance column, between the 2
  November and 2 December installments, and 2 December shows "payment
  €849.91"

#### Scenario: A correction row on a phone
- **WHEN** the schedule is opened 390px wide
- **THEN** the correction row shows its date and "Corrected" on one side
  and the amount owed with the payment change on the other, without
  sideways scrolling

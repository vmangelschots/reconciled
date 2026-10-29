# loan-schedules Specification

## Purpose

Keeps a loan account at its real balance without hand updates, by
computing the loan's annuity schedule from its terms and posting each
installment's principal when the app sees the payment leave the paying
account.

## Requirements

### Requirement: Set up a loan
On an active loan account, the system SHALL let the user set up the
loan's terms: the amount borrowed, the annual rate, the term in months,
the date of the first installment, the account it is paid from, and
optionally a category for the payment. The paying account SHALL be
another active account that is not a loan. A loan account SHALL have at
most one setup. Other account types SHALL NOT offer it.

#### Scenario: Set up the mortgage
- **WHEN** the user sets up "Mortgage" (loan) as 200,000.00 at 3.00% over
  300 months, first installment on 2 December 2024, paid from "Crelan",
  category "Housing / Mortgage"
- **THEN** "Mortgage" has a loan setup with those terms and a schedule of
  300 installments

#### Scenario: Invalid terms are rejected
- **WHEN** the user sets up a loan with an amount of 0.00, a negative
  rate, a term of 0 months, or "Mortgage" itself as the paying account
- **THEN** the setup is rejected with a message and nothing changes

#### Scenario: Not offered on other accounts
- **WHEN** the user opens the ledger of a checking, savings, investment
  or property account
- **THEN** there is no loan schedule to set up

### Requirement: Check the terms before saving
While the user enters or edits the terms, the form SHALL show, before
anything is saved: the monthly payment; the next installment's number
and date; the schedule's balance today next to the loan's current
balance; and the payments of that amount found in the paying account in
the last 90 days, or a warning that none were found. The term SHALL be
shown in months and years, and the date field SHALL be labelled as the
first installment from the repayment table. When setting up a loan, the
form SHALL also accept what the bank says is owed and on which day,
today by default and no earlier than one month before; the setup is
then saved with a correction of that amount on that day, and the form
checks the payment that correction gives instead.

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

#### Scenario: Setting up with the bank's figure from before an installment
- **WHEN** on 29 October 2026 the user sets up 160,000.00 at 2.7836% over
  300 months from 28 December 2014, and enters that the bank says
  91,786.35 was owed on 27 October 2026
- **THEN** the form shows €693.03 a month and the payments of -693.03
  found in the paying account, and saving creates the setup with a
  correction of 91,786.35 on 27 October 2026

### Requirement: Annuity schedule
The schedule SHALL have one installment per month of the term, each with
the same payment, split into interest and principal. The monthly rate
SHALL be the equivalent rate (1 + annual rate)^(1/12) - 1. Each
installment's interest SHALL be the balance before it times the monthly
rate, and its principal the payment minus the interest. All amounts SHALL
be rounded to the cent, half up. The last installment SHALL repay what is
left, so the balance after it is 0.00.

#### Scenario: The Belgian monthly rate
- **WHEN** a loan is 200,000.00 at 3.00% over 300 months
- **THEN** the payment is 944.22 (not the 948.42 that 3.00% / 12 gives),
  and the first installment is 493.25 interest and 450.97 principal,
  leaving 199,549.03

#### Scenario: The last installment absorbs the rounding
- **WHEN** a loan is 1,000.00 at 6.00% over 3 months
- **THEN** the installments are 336.58 (4.87 interest, 331.71 principal),
  336.58 (3.25, 333.33) and 336.59 (1.63, 334.96), leaving 0.00

#### Scenario: A loan without interest
- **WHEN** a loan is 1,200.00 at 0.00% over 12 months
- **THEN** each installment is 100.00 principal and no interest

### Requirement: Installment dates
Installment N SHALL fall N - 1 months after the first installment, on
its day of the month, or on the last day of a month that is shorter.

#### Scenario: Month ends
- **WHEN** the first installment is on 31 January 2027
- **THEN** the next installments fall on 28 February 2027 and 31 March
  2027

### Requirement: Line up at setup
Setting up a loan SHALL post a value adjustment on the loan account dated
the setup day, set to minus the schedule's balance at the end of the day
before it: after the last installment or correction dated before that
day, whichever is later, or the amount borrowed if there is neither.
Installments dated before the setup day SHALL NOT be posted separately.
When the loan has a correction on the setup day, that correction's
adjustment SHALL take the line-up's place.

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

#### Scenario: A correction the day before setup
- **WHEN** a loan is set up on 29 October 2026 with a correction of
  91,786.35 on 28 October 2026, after that day's installment
- **THEN** its line-up on 29 October 2026 is set to -91,786.35

### Requirement: Match an installment's payment
For each installment dated on or after the setup day and not yet
matched, the system SHALL look in the paying account for the payment: a
transaction of minus the installment's payment, dated no more than 5
days before or after the installment. If there are several, it SHALL
pick the closest date. A transaction SHALL match at most one installment.
Transfers, split transactions and value adjustments SHALL never match.

#### Scenario: The payment is booked two days late
- **WHEN** the installment of 2 November 2026 is 944.22, and "Crelan"
  has -944.22 to "BNP HYPOTHEEK" on 4 November 2026
- **THEN** that transaction is the installment's payment

#### Scenario: A different amount doesn't match
- **WHEN** the installment is 944.22 and the only nearby outflow in
  "Crelan" is -944.20
- **THEN** the installment stays unmatched

#### Scenario: Too far from the date
- **WHEN** the installment is dated 2 November and "Crelan" has -944.22
  only on 9 November
- **THEN** the installment stays unmatched

#### Scenario: Two loans paid from one account on the same day
- **WHEN** "Mortgage A" (944.22 a month) and "Mortgage B" (312.40 a
  month) are both paid from "Crelan", which has -944.22 and -312.40 on 2
  November
- **THEN** -944.22 is the payment of "Mortgage A"'s installment and
  -312.40 that of "Mortgage B"'s

### Requirement: Post the principal on a match
When an installment's payment is matched, the system SHALL post a value
adjustment on the loan account, dated on the payment, set to minus the
installment's balance after, and linked to the payment. The payment
SHALL stay an ordinary transaction in the paying account.

#### Scenario: Net worth drops by the interest
- **WHEN** "Mortgage" stands at -200,000.00 from its line-up, its first
  installment on 2 November is 944.22 with 493.25 interest and a balance
  after of 199,549.03, and the -944.22 payment on 4 November in "Crelan"
  is matched
- **THEN** "Mortgage" gets a value adjustment dated 4 November set to
  -199,549.03 (+450.97), "Crelan" keeps its -944.22, and net worth drops
  by 493.25

#### Scenario: The budget sees the full payment
- **WHEN** the matched payment is categorized "Housing / Mortgage"
- **THEN** the budget counts 944.22 spent in "Housing / Mortgage"

### Requirement: Categorize the matched payment
When a payment is matched and the loan has a payment category, the
system SHALL give the payment that category, confirmed, if it had no
category or only an unconfirmed guess. A confirmed category SHALL be
kept.

#### Scenario: An uncategorized payment
- **WHEN** a matched payment had no category and the loan's payment
  category is "Housing / Mortgage"
- **THEN** the payment is categorized "Housing / Mortgage" and is not
  waiting in Review

#### Scenario: The user's own category stays
- **WHEN** a matched payment was confirmed as "Housing / Loan" by the
  user
- **THEN** it keeps "Housing / Loan"

### Requirement: Link a payment by hand
An unmatched installment dated on or after the setup day SHALL offer
"Link payment", listing outflows in any active account that is not a
loan, dated within 15 days of the installment, that are not transfers,
split transactions, value adjustments or another installment's payment,
closest amount first. Choosing one SHALL post the installment as a match
does. A payment linked by hand SHALL offer "Unlink", which removes its
adjustment.

#### Scenario: Booked a week late
- **WHEN** the 2 November installment of 944.22 is missed and "Crelan"
  has -944.22 on 9 November
- **THEN** "Link payment" lists it first, and choosing it posts the
  installment with an adjustment dated 9 November

#### Scenario: Paid by hand from savings
- **WHEN** the 2 November installment was paid with -944.22 from
  "Savings"
- **THEN** "Link payment" lists it, and choosing it posts the installment

#### Scenario: A cent off
- **WHEN** the bank took -944.21 on 2 November for a 944.22 installment
- **THEN** "Link payment" lists it first, and once linked it stays linked

#### Scenario: Unlink a wrong choice
- **WHEN** the user linked the wrong payment and chooses "Unlink"
- **THEN** the adjustment is removed and the installment is unmatched
  again

### Requirement: A payment that changes is unmatched
When a matched payment is deleted, made a transfer or split, the system
SHALL remove its scheduled adjustment, and the installment SHALL be
unmatched again. A payment matched automatically SHALL also be unmatched
when it moves to another account or its amount changes; a payment linked
by hand SHALL NOT.

#### Scenario: The payment is deleted
- **WHEN** the matched -944.22 payment of 4 November is deleted
- **THEN** its adjustment is removed from "Mortgage", whose balance goes
  back to what it was before the match, and the installment is unmatched

#### Scenario: An automatic match's amount changes
- **WHEN** the automatically matched -944.22 payment is edited to -900.00
- **THEN** its adjustment is removed and the installment is unmatched

### Requirement: Matched payments show their installment
In the paying account's ledger, a payment matched to an installment SHALL
show a tag naming the loan and the installment, linking to the loan's
schedule.

#### Scenario: Tag on the payment
- **WHEN** the -944.22 payment in "Crelan" is matched to "Mortgage"'s
  installment 24
- **THEN** its row shows "Mortgage · installment 24", opening the
  "Mortgage" schedule

### Requirement: Matching needs no background job
The system SHALL bring every loan's matches up to date whenever the
overview, a loan's schedule or an account's ledger is shown, and after an
import is committed. It SHALL never post an adjustment twice for the same
installment.

#### Scenario: After an import
- **WHEN** an import into "Crelan" brings in the -944.22 payment, and the
  user then opens the "Mortgage" ledger
- **THEN** the ledger shows the installment's adjustment

#### Scenario: Shown twice
- **WHEN** the overview is loaded twice after a payment arrived
- **THEN** "Mortgage" has one adjustment for that installment

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

### Requirement: Remove a loan setup
The user SHALL be able to remove a loan's setup after confirming.
Removing SHALL keep the posted adjustments as ordinary value adjustments
and stop posting installments.

#### Scenario: Removing the setup
- **WHEN** the user removes the setup of "Mortgage" and confirms
- **THEN** its balance doesn't change, its adjustments become ordinary
  ones that can be deleted, and no more installments are posted

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

### Requirement: The schedule opens on what matters now
The table SHALL first show the last 2 posted installments, the current
one and the next 12, with controls to show the earlier ones and all the
rest. On a phone, each installment SHALL be one two-line row instead of
a table row, so the page never scrolls sideways.

#### Scenario: A long loan
- **WHEN** a 300-month loan is at installment 24
- **THEN** installments 22 to 36 are shown, with "Show earlier" above
  and "Show all (264 more, to Nov 2049)" below

#### Scenario: On a phone
- **WHEN** the schedule is opened 390px wide
- **THEN** each installment shows its date and state on one side and its
  balance after with "interest · principal" on the other, without
  sideways scrolling

### Requirement: Correct a loan's balance
A loan with a setup SHALL let the user record a balance correction: a
date and the amount the bank says is still owed at the end of that day.
The date SHALL be no earlier than one month before the setup day and no
later than today. There SHALL be at most one correction per date. The
amount SHALL be 0.00 or more.

#### Scenario: The bank's figure after an extra repayment
- **WHEN** on 12 November 2026 the user corrects "Mortgage" to 170,000.00
  owed on 12 November 2026
- **THEN** "Mortgage" has a correction on 12 November 2026 of 170,000.00

#### Scenario: The bank's figure from before the latest installment
- **WHEN** "Mortgage" was set up on 29 October 2026, and the user
  corrects it to 91,786.35 owed on 27 October 2026, the day before the
  28 October installment
- **THEN** "Mortgage" has a correction on 27 October 2026 of 91,786.35

#### Scenario: Dates that are refused
- **WHEN** the user enters a correction dated tomorrow, more than one
  month before the setup day, or on a date that already has a correction
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
Saving a correction dated on or after the setup day SHALL post a value
adjustment on the loan account, dated on the correction, set to minus
the corrected amount. A correction dated before the setup day SHALL post
no adjustment of its own; the line-up SHALL follow it. Installments after
the correction that were posted SHALL be reposted from the new schedule,
as an edit of the terms reposts them.

#### Scenario: The balance follows the bank
- **WHEN** "Mortgage" stands at -188,864.23 and is corrected to
  170,000.00 on 12 November 2026
- **THEN** "Mortgage" gets a value adjustment dated 12 November 2026 set
  to -170,000.00, and its balance is -170,000.00

#### Scenario: A correction before the setup day
- **WHEN** "Mortgage" (160,000.00 at 2.7836% over 300 months from 28
  December 2014) was set up on 29 October 2026, and is corrected to
  91,786.35 on 27 October 2026
- **THEN** it gets no adjustment dated 27 October 2026, its line-up on 29
  October 2026 is set to -91,303.56, the balance after the 28 October
  installment, and the installments from 28 November 2026 are 693.03

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

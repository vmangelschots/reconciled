# Spec Delta

## MODIFIED Requirements

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

# Spec Delta

## ADDED Requirements

### Requirement: The payment category gets its budget from the loan
Saving a loan with a payment category SHALL make that category's budget
come from its loans (see the `bill-budgets` capability), deleting any
monthly limits, yearly budget or manual bills it had. Before saving, the
form SHALL warn under the payment category, in the warning colour, when
that would replace a budget, saying which. When the category already
follows other loans, it SHALL say, muted, which loans it joins.

#### Scenario: Replacing a monthly limit
- **WHEN** the user picks "Mortgage", which has a 1,400.00 monthly limit,
  as the payment category of "House A"
- **THEN** the form warns "Mortgage's €1,400 monthly budget will be
  replaced by this loan's payment", and after saving "Mortgage" has no
  limit and House A as its bill

#### Scenario: Joining another loan
- **WHEN** "Mortgage" already follows "House A" and the user picks it for
  "House B"
- **THEN** the form says "Joins House A in Mortgage's bills" without a
  warning

#### Scenario: Nothing to replace
- **WHEN** the user picks a category without a budget
- **THEN** the form shows no warning

### Requirement: A category without loans goes back to no budget
When a loan's payment category is cleared or changed, or its setup is
removed, the category it paid into SHALL go back to a monthly category
without a limit once no loan on an active account pays into it. Before
saving, the form SHALL say so.

#### Scenario: Clearing the category
- **WHEN** "House A" is the only loan paying into "Mortgage" and the user
  clears its payment category
- **THEN** the form says "Mortgage goes back to no budget", and after
  saving "Mortgage" is monthly without a limit

#### Scenario: Another loan still pays in
- **WHEN** "House A" and "House B" pay into "Mortgage" and the user
  removes "House A"'s setup
- **THEN** "Mortgage" keeps House B as its bill

## MODIFIED Requirements

### Requirement: Matching needs no background job
The system SHALL bring every loan's matches up to date whenever the
overview, the Budgets page, a loan's schedule or an account's ledger is
shown, and after an import is committed. It SHALL never post an adjustment twice for the same
installment.

#### Scenario: After an import
- **WHEN** an import into "Crelan" brings in the -944.22 payment, and the
  user then opens the "Mortgage" ledger
- **THEN** the ledger shows the installment's adjustment

#### Scenario: Shown twice
- **WHEN** the overview is loaded twice after a payment arrived
- **THEN** "Mortgage" has one adjustment for that installment

#### Scenario: On the Budgets page
- **WHEN** a -1,050.00 payment from "Crelan" arrived for "House A"'s
  installment, and the user opens Budgets
- **THEN** "Mortgage" shows House A as paid

### Requirement: Schedule table
The schedule SHALL list each installment's date, interest, principal and
balance after; the last installment SHALL show its own payment, and so
SHALL the first installment after a correction. State SHALL show only
for: posted installments ("Posted" and the payment's date), the first
unmatched installment not yet 5 days past its date ("Due"), and
unmatched ones more than 5 days past it ("Missed", in the critical
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
- **THEN** it reads "Missed" in the critical colour and offers "Link
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

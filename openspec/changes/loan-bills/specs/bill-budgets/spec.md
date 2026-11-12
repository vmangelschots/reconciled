# Spec Delta

## ADDED Requirements

### Requirement: A loan's payment category takes its bills from the loans
A category that is the payment category of one or more loans on active
accounts SHALL be a Bills category whose bills come from those loans:
one bill per installment dated in the month, named after the loan, on
the installment's day, for the installment's payment. Installments before
the loan's setup day, and installments covered by a balance correction,
SHALL NOT be bills.

#### Scenario: Two house loans in one category
- **WHEN** "House A" pays 1,050.00 and "House B" 420.00 on the 7th, both
  with payment category "Mortgage"
- **THEN** "Mortgage" has two bills in November, House A 1,050.00 and
  House B 420.00 on the 7th, and a budget of 1,470.00

#### Scenario: A correction lowers the payment
- **WHEN** "House A"'s 7 November installment was paid, and a correction
  on 12 November makes its payment from December 980.00
- **THEN** "Mortgage" has a budget of 1,470.00 in November and 1,400.00
  in December

#### Scenario: A paid-off loan
- **WHEN** "Car loan"'s last installment is in March 2027
- **THEN** its bill is in March 2027 and not in April 2027

#### Scenario: A covered installment
- **WHEN** a correction on 12 November covers the unmatched 2 November
  installment of "House A"
- **THEN** November has no bill for "House A"

### Requirement: A loan bill's state follows the loan
A loan bill SHALL be paid when its installment is matched to a payment,
on that payment's date. Otherwise its state SHALL follow the rules for
any bill.

#### Scenario: Matched on the 8th
- **WHEN** "House A"'s 7 November installment is matched to a payment on
  8 November
- **THEN** its bill is paid on 8 November

#### Scenario: Not seen yet
- **WHEN** it is 10 November and "House A"'s 7 November installment has
  no match
- **THEN** its bill is not seen

### Requirement: A loan category isn't budgeted by hand
A loan category SHALL NOT take a monthly limit, a yearly budget, another
budget kind or manual bills. Spending in it beyond its loan bills SHALL
count as over.

#### Scenario: No limit on Mortgage
- **WHEN** the user tries to set a monthly limit on "Mortgage"
- **THEN** the system rejects it, saying the loans set its budget

#### Scenario: Insurance in Mortgage
- **WHEN** "Mortgage"'s loan bills total 1,470.00 and a 35.00 insurance
  payment is also categorized "Mortgage"
- **THEN** "Mortgage" is 35.00 over

### Requirement: Loan bills aren't bill warnings
Needs attention SHALL NOT list a missed loan bill among the missed bills.
The loan's missed payment line covers it.

#### Scenario: House A missed
- **WHEN** "House A"'s 7 November installment is missed
- **THEN** Needs attention shows the loan's missed payment line and no
  "House A missed" bill line

### Requirement: Loan categories are marked
The category picker SHALL mark a loan category with a muted bank icon
and name its loans on hover. Its budget editor SHALL show which loans set
its budget, each linking to its schedule, instead of the kind switch. In
its sheet, each loan bill SHALL carry the bank icon and link to its
loan's schedule.

#### Scenario: The Mortgage editor
- **WHEN** the user opens the "Mortgage" budget sheet
- **THEN** it says "Set by 2 loans: House A, House B" with links, and
  offers no kind switch or bill editing

#### Scenario: Picking a category
- **WHEN** the user opens a category picker that lists "Mortgage"
- **THEN** "Mortgage" shows a bank icon, and hovering it says "Budget set
  by loans: House A, House B"

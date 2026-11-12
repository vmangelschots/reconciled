# Spec Delta

## ADDED Requirements

### Requirement: A Bills category's first bill can come from a payment
A Bills category without bills that count in the viewed month, other than
a loan category, SHALL still open the Bills sheet: "To review" with its
payments in the current month and the month before, each with Add as
bill, and a bill list that says it has no bills yet, with Edit bills. Its
row SHALL show what it spent, without a bar, until it has a bill.

#### Scenario: Streaming without bills
- **WHEN** "Streaming" was just made a Bills category, has no bills, and
  has a PayPal payment of 7.99 on 18 November
- **THEN** its row shows "€8 spent" in the No budget group, and its sheet
  lists the 7.99 under "To review" with Add as bill and says it has no
  bills yet, with Edit bills

#### Scenario: The first bill from a payment
- **WHEN** the user adds that payment as "Apple TV"
- **THEN** "Streaming" has one bill, Apple TV 7.99 on the 18th, paid in
  November, and its row becomes a Bills row with "Paid"

#### Scenario: An older month
- **WHEN** the user views September for a Bills category without bills
- **THEN** its sheet says it has no bills yet and shows no "To review"

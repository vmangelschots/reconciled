# Spec Delta

## MODIFIED Requirements

### Requirement: Needs attention
The overview SHALL list what needs action, each item linking to where
it is fixed, in this order: guesses to review (to Review), uncategorized
transactions with this month's uncategorized spending (to Review),
category warnings (to Budgets on the chosen month), yearly warnings (to
Budgets on the chosen month), missed loan payments (to the loan's
schedule), then a stale import (to Import). When nothing needs
attention, the panel SHALL show one line saying everything is in order.

#### Scenario: Everything that needs attention
- **WHEN** on 24 October 12 guesses wait for review, 4 transactions are
  uncategorized with 213.00 of uncategorized spending this month,
  "Groceries" spent 412.00 of 350.00, "Restaurants" 180.00 of 200.00,
  "Property tax" of 400.00 is due on 1 November and unpaid, the
  "Mortgage" payment of 2 October was not seen, and "Crelan" was last
  imported on 12 October
- **THEN** the panel lists "12 guesses to review", "4 uncategorized
  (€213 this month)", "Groceries €62 over", "Restaurants at 90%",
  "Property tax due in 8 days", "Mortgage: payment of 2 Oct not seen"
  and "Crelan: last import 12 days ago", in that order

#### Scenario: Category items open the right month
- **WHEN** the user switches to September and selects "Groceries €30
  over"
- **THEN** the Budgets page opens on September

#### Scenario: Nothing to do
- **WHEN** nothing waits for review, nothing is uncategorized, no
  category or yearly budget needs a warning, no loan payment was missed
  and every account was imported in the last 7 days
- **THEN** the panel shows one line saying everything is in order

## ADDED Requirements

### Requirement: Missed loan payments
Needs attention SHALL list a loan when its latest installment that is
more than 5 days past its date has no matched payment. The line SHALL
name the loan and that installment's date, with the installment number,
amount and paying account beneath, and open the loan's schedule at it.
A loan whose latest such installment is matched SHALL NOT be listed,
even if an earlier one was missed.

#### Scenario: A payment not seen
- **WHEN** today is 12 November and the "Mortgage" installment of 2
  November has no matched payment
- **THEN** needs attention shows "Mortgage: payment of 2 Nov not seen"
  with "Installment 2 of 300 · €944.22 from Crelan" beneath, opening the
  "Mortgage" schedule at that installment

#### Scenario: Still within the window
- **WHEN** today is 5 November and the 2 November installment has no
  matched payment yet
- **THEN** no loan item is shown

#### Scenario: A later payment matched
- **WHEN** the 2 October installment was missed but the 2 November one
  was matched
- **THEN** no loan item is shown

#### Scenario: A loan without a setup
- **WHEN** a loan account has no loan setup
- **THEN** it never shows a missed-payment item

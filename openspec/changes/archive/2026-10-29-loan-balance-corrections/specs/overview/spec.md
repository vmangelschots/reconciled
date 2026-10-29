# Spec Delta

## MODIFIED Requirements

### Requirement: Missed loan payments
Needs attention SHALL list a loan when its latest installment that is
more than 5 days past its date has no matched payment and is not covered
by a balance correction. The line SHALL name the loan and that
installment's date, with the installment number, amount and paying
account beneath, and open the loan's schedule at it. A loan whose latest
such installment is matched or covered SHALL NOT be listed, even if an
earlier one was missed.

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

#### Scenario: Covered by a correction
- **WHEN** the 2 November installment has no matched payment, and the
  balance was corrected on 10 November
- **THEN** no loan item is shown

#### Scenario: A loan without a setup
- **WHEN** a loan account has no loan setup
- **THEN** it never shows a missed-payment item

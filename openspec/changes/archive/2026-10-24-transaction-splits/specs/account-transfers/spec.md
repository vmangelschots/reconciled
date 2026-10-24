# Spec Delta

## MODIFIED Requirements

### Requirement: Link to a matching transaction
When a transaction is marked as a transfer, the system SHALL look in the
target account for an unlinked transaction with the opposite amount,
dated no more than 5 days before or after it. If there is one, the system
SHALL link the two. If there are several, it SHALL pick the one with the
closest date. Each side SHALL keep its own date. The matched transaction
SHALL lose its category. A split transaction and the parts of one SHALL
never be picked as the match.

#### Scenario: Link across different booking dates
- **WHEN** -500.00 on 3 March in "Checking" is marked as a transfer to
  "Savings", which has an unlinked +500.00 on 5 March
- **THEN** the two are linked, dated 3 and 5 March respectively

#### Scenario: Closest date wins
- **WHEN** "Savings" has unlinked +500.00 transactions on 1 March and 4
  March, and -500.00 on 3 March in "Checking" is marked as a transfer to
  "Savings"
- **THEN** it is linked to the 4 March transaction

#### Scenario: Too far apart does not match
- **WHEN** the only +500.00 in "Savings" is dated 9 March, and -500.00 on
  3 March is marked as a transfer to "Savings"
- **THEN** it is not linked to the 9 March transaction

#### Scenario: Splits are never matched
- **WHEN** the only +500.00 in "Savings" within the window is a split
  transaction, and -500.00 in "Checking" is marked as a transfer to
  "Savings"
- **THEN** it is not linked to the split transaction, and a counterpart
  is created in "Savings" instead

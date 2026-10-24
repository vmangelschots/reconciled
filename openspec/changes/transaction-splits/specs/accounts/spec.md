# Spec Delta

## MODIFIED Requirements

### Requirement: View account balances
The system SHALL compute and display each account's current balance as
its starting balance plus the sum of all its transactions. A split
transaction SHALL count once, at its own amount; its parts SHALL NOT be
counted again.

#### Scenario: List accounts with balances
- **WHEN** the user views the accounts list
- **THEN** the system shows each non-archived account with its current
  computed balance

#### Scenario: Balance updates after a transaction is added
- **WHEN** a new transaction of -50.00 is added to an account with
  current balance 1000.00
- **THEN** the account's current balance becomes 950.00

#### Scenario: Splitting does not change the balance
- **WHEN** a -60.00 transaction in an account with current balance
  1000.00 is split into two -30.00 parts
- **THEN** the account's current balance stays 1000.00

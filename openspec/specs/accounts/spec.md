# Accounts Specification

## Purpose

Accounts represent the user's financial accounts (checking, savings, credit
card, cash) and their balances - the foundation every transaction, budget,
and forecast in the system is built on.

## Requirements

### Requirement: Create account
The system SHALL allow the user to create an account with a name, an
account type (checking, savings, credit_card, cash, or other), and a
starting balance.

#### Scenario: Create a checking account
- **WHEN** the user submits a new account with name "Main Checking", type
  "checking", and starting balance 1000.00
- **THEN** the system creates the account and its current balance is
  1000.00

#### Scenario: Account name is required
- **WHEN** the user submits a new account with no name
- **THEN** the system rejects the request and does not create an account

### Requirement: Edit account
The system SHALL allow the user to rename an account or change its account
type at any time.

#### Scenario: Rename an account
- **WHEN** the user renames "Main Checking" to "Everyday Checking"
- **THEN** the account's name is updated and all its transactions remain
  linked to the same account

### Requirement: Starting balance is immutable once transactions exist
The system SHALL allow editing an account's starting balance only while
the account has zero transactions. Once a transaction exists on the
account, the starting balance becomes read-only.

#### Scenario: Edit starting balance before any transactions
- **WHEN** the user changes the starting balance of an account with no
  transactions from 1000.00 to 1200.00
- **THEN** the system updates the starting balance and the account's
  current balance becomes 1200.00

#### Scenario: Attempt to edit starting balance after transactions exist
- **WHEN** the user attempts to change the starting balance of an account
  that already has one or more transactions
- **THEN** the system rejects the change and explains that the starting
  balance can no longer be edited

### Requirement: Archive account
The system SHALL allow the user to archive an account instead of deleting
it, preserving its transaction history.

#### Scenario: Archive an account
- **WHEN** the user archives an account
- **THEN** the account no longer appears in the default account list or
  as a destination for new transactions, but its past transactions remain
  viewable and still count toward historical reports

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

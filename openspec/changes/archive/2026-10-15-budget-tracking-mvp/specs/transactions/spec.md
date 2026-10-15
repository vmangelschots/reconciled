# Spec Delta

## Purpose

The transaction ledger records the flow of money through an account over
time - the record that account balances, budgets, and forecasts are all
computed from.

## ADDED Requirements

### Requirement: Create manual transaction
The system SHALL allow the user to manually add a transaction to an
account with a date, an amount (positive for inflow, negative for
outflow), a payee or description, and an optional category.

#### Scenario: Add an expense transaction
- **WHEN** the user adds a transaction to "Main Checking" dated today for
  -42.50 with payee "Grocery Store"
- **THEN** the transaction is created on that account and the account's
  current balance decreases by 42.50

#### Scenario: Amount is required and non-zero
- **WHEN** the user submits a transaction with no amount or an amount of
  zero
- **THEN** the system rejects the request

### Requirement: Edit transaction
The system SHALL allow the user to edit a transaction's date, amount,
payee, category, and notes after it has been created.

#### Scenario: Correct a mistyped amount
- **WHEN** the user edits a transaction's amount from -42.50 to -45.00
- **THEN** the transaction is updated and the account's current balance
  reflects the corrected amount

### Requirement: Delete transaction
The system SHALL allow the user to delete a transaction.

#### Scenario: Delete a transaction
- **WHEN** the user deletes a transaction of -42.50 from an account
- **THEN** the transaction no longer appears in the ledger and the
  account's current balance increases by 42.50

### Requirement: Categorize transaction
The system SHALL allow each transaction to be assigned to at most one
budget category, or left uncategorized.

#### Scenario: Assign a category
- **WHEN** the user assigns the category "Groceries" to a transaction
- **THEN** the transaction's amount counts toward the "Groceries" category
  for its transaction month

#### Scenario: Leave a transaction uncategorized
- **WHEN** a transaction has no category assigned
- **THEN** the system still lists it in the ledger but does not count it
  toward any category's spend

### Requirement: List and filter transactions
The system SHALL allow the user to list an account's transactions and
filter them by date range, category, and a text search over payee and
notes.

#### Scenario: Filter by date range and category
- **WHEN** the user filters an account's transactions to the current
  month and category "Groceries"
- **THEN** the system returns only that account's transactions in the
  current month assigned to "Groceries"

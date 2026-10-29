# Accounts Specification

## Purpose

Accounts represent the user's financial accounts (checking, savings, credit
card, cash) and their balances - the foundation every transaction, budget,
and forecast in the system is built on.

## Requirements

### Requirement: Create account
The system SHALL allow the user to create an account with a name, an
account type (checking, savings, credit_card, cash, investment,
property, loan, or other), and a starting balance.

#### Scenario: Create a checking account
- **WHEN** the user submits a new account with name "Main Checking", type
  "checking", and starting balance 1000.00
- **THEN** the system creates the account and its current balance is
  1000.00

#### Scenario: Account name is required
- **WHEN** the user submits a new account with no name
- **THEN** the system rejects the request and does not create an account

### Requirement: Edit account
The system SHALL allow the user to rename an account, change its account
type, or change its starting balance at any time, whether or not the
account has transactions.

#### Scenario: Rename an account
- **WHEN** the user renames "Main Checking" to "Everyday Checking"
- **THEN** the account's name is updated and all its transactions remain
  linked to the same account

#### Scenario: Edit starting balance before any transactions
- **WHEN** the user changes the starting balance of an account with no
  transactions from 1000.00 to 1200.00
- **THEN** the system updates the starting balance and the account's
  current balance becomes 1200.00

#### Scenario: Edit starting balance after transactions exist
- **WHEN** the user changes the starting balance of an account from
  1000.00 to 1200.00, and the account has transactions totalling -300.00
- **THEN** the system updates the starting balance, the account's current
  balance becomes 900.00, and its transactions are unchanged

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

### Requirement: Account tiers
Every account SHALL belong to a tier given by its type, from most to
least liquid: Everyday (checking, cash, credit_card, other), Savings
(savings), Investments (investment), Property (property) and Loans
(loan). Changing an account's type SHALL move it to that type's tier.

#### Scenario: Tier follows the type
- **WHEN** the user creates "Funds" with type "investment"
- **THEN** it belongs to the Investments tier

#### Scenario: Changing the type moves the tier
- **WHEN** the user changes "Revolut Pockets" from "savings" to
  "checking"
- **THEN** it moves from the Savings tier to the Everyday tier

### Requirement: Type choice shows the tier
When creating or editing an account, the type choices SHALL be grouped
under their tier's name, in tier order, with "Other" labelled "Other
(everyday)". The accounts list SHALL show each account's tier.

#### Scenario: Choosing a type
- **WHEN** the user opens the type choice
- **THEN** Checking, Cash, Credit Card and Other (everyday) are grouped
  under Everyday, followed by Savings, Investments, Property and Loans

### Requirement: A loan's starting balance is what is owed
For a loan account, the starting balance SHALL be entered as the amount
still owed, as a positive number, and SHALL be stored as a negative
balance.

#### Scenario: Create a mortgage
- **WHEN** the user creates "Mortgage" with type "loan" and enters
  250,000.00 still owed
- **THEN** the system creates the account and its current balance is
  -250,000.00

### Requirement: Accounts are listed by tier
Wherever active accounts are listed or offered (the accounts list, the
sidebar, account pills, the Overview's Accounts tile, transfer targets,
and the Import and Forecast account choices), they SHALL be ordered by
tier and then by name.

#### Scenario: A house after everyday accounts
- **WHEN** the active accounts are "House" (property), "Crelan"
  (checking), "Spaarrekening" (savings) and "Revolut" (checking)
- **THEN** they are listed Crelan, Revolut, Spaarrekening, House

### Requirement: Open an account from the Accounts page
On the Accounts page, each account's name SHALL open that account's
transactions.

#### Scenario: Open an account's transactions
- **WHEN** the user chooses "Crelan" on the Accounts page
- **THEN** Crelan's transactions open

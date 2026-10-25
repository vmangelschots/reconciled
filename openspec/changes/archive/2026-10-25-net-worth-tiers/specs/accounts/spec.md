# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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

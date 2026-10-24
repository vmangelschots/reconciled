# Spec Delta

## ADDED Requirements

### Requirement: Each account's ledger has its own address
Each account's transactions SHALL open at an address of their own. The
plain Transactions address SHALL open the account last opened in this
browser, or the first active account when there is none or it is gone.
The ledger SHALL NOT offer an account dropdown.

#### Scenario: Open an account directly
- **WHEN** the user opens Crelan's ledger address
- **THEN** Crelan's transactions are shown

#### Scenario: Back to the last account
- **WHEN** the user last opened Crelan and later selects Transactions in
  the tab bar
- **THEN** Crelan's transactions open

#### Scenario: Nothing opened yet
- **WHEN** no account was opened before in this browser
- **THEN** Transactions opens the first active account

### Requirement: Archived and unknown accounts in the ledger
An archived account's ledger address SHALL still open, marked
"Archived", without the form to add transactions. An address for an
account that doesn't exist SHALL go to the plain Transactions address
with a notice.

#### Scenario: An archived account
- **WHEN** the user opens the ledger address of the archived "Old"
  account, for example through a transfer link
- **THEN** its transactions are shown, marked "Archived", with no add
  form

#### Scenario: An unknown account
- **WHEN** the user opens a ledger address for an account that doesn't
  exist
- **THEN** the last-opened account's transactions open and a notice says
  the account wasn't found

### Requirement: An empty ledger points to Import
A ledger with no transactions SHALL offer Import, opening the Import
page with that account selected.

#### Scenario: A new account
- **WHEN** the user opens the ledger of "Savings", which has no
  transactions
- **THEN** the ledger offers Import, which opens Import on "Savings"

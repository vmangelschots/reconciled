# Spec Delta

## MODIFIED Requirements

### Requirement: Accounts under Transactions in the sidebar
With more than one active account, the sidebar SHALL list them under
Transactions, indented, each with its balance in whole euros; long names
SHALL be shortened with the full name shown on hover. The open account
SHALL be the only one marked as current. With one active account there
SHALL be no sub-items. Beyond five accounts, the sidebar SHALL list the
first five and "+N more", which expands the list to every active
account, with "Show fewer" to collapse it again. When the open account
is not among the first five, the list SHALL start expanded.

#### Scenario: Two accounts in the sidebar
- **WHEN** "Revolut" holds 2,140.00 and "Crelan" 1,342.00
- **THEN** the sidebar lists "Revolut €2,140" and "Crelan €1,342" under
  Transactions

#### Scenario: The open account is marked
- **WHEN** the user is on Crelan's transactions
- **THEN** "Crelan" is marked as current and "Transactions" is not
  filled

#### Scenario: One account
- **WHEN** there is only one active account
- **THEN** Transactions has no sub-items

#### Scenario: Many accounts
- **WHEN** there are seven active accounts
- **THEN** the sidebar lists five of them and "+2 more"

#### Scenario: Show the rest
- **WHEN** there are seven active accounts and the user chooses "+2
  more"
- **THEN** the sidebar lists all seven, each opening its transactions,
  and "Show fewer" brings it back to five

#### Scenario: The open account is one of the rest
- **WHEN** there are seven active accounts and the user is on the
  seventh one's transactions
- **THEN** the sidebar lists all seven with the seventh marked as
  current, and "Show fewer"

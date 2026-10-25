# Spec Delta

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Starting balance is immutable once transactions exist
**Reason**: Every balance is computed from the starting balance and the
transactions when it is read, so editing it leaves nothing inconsistent.
Locking it only made a wrong opening figure impossible to fix.
**Migration**: None. The starting balance is now edited through "Edit
account", like the name and type.

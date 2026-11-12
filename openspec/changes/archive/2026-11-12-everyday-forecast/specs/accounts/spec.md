## MODIFIED Requirements

### Requirement: Accounts are listed by tier
Wherever active accounts are listed or offered (the accounts list, the
sidebar, account pills, the Overview's Accounts tile, transfer targets,
the Import account choice and the accounts an expected item can be
recognised by), they SHALL be ordered by tier and then by name.

#### Scenario: A house after everyday accounts
- **WHEN** the active accounts are "House" (property), "Crelan"
  (checking), "Spaarrekening" (savings) and "Revolut" (checking)
- **THEN** they are listed Crelan, Revolut, Spaarrekening, House

### Requirement: Covered entries are not in an account
Covered entries (see the `repayment-tabs` capability) SHALL be kept apart
from the user's accounts. No account list, choice or total SHALL show
where they are kept: the accounts list, the sidebar, account pills,
transfer targets, the Import and bank sync account choices, the accounts
an expected item can be recognised by, the Overview's Accounts tile and
import reminders, and net worth. They SHALL NOT change any account's
balance.

#### Scenario: Accounts list after a covered entry
- **WHEN** the user has "Crelan" and "Revolut" and records that Sarah paid
  15.00 for takeout
- **THEN** the accounts list, the sidebar and the Overview's Accounts tile
  still show only "Crelan" and "Revolut", with unchanged balances

#### Scenario: No import reminder
- **WHEN** covered entries exist and every account was imported today
- **THEN** needs attention shows no stale-import line

#### Scenario: No ledger of its own
- **WHEN** the user opens a ledger address for the place covered entries
  are kept
- **THEN** it goes to the plain Transactions address with a notice, as for
  an account that doesn't exist

#### Scenario: Not a transfer target
- **WHEN** the user makes a transaction a transfer
- **THEN** the place covered entries are kept is not offered as the
  target

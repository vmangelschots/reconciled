# Spec Delta

## ADDED Requirements

### Requirement: First run for a new household
While a household has no transactions, the Overview SHALL welcome it with Add your
accounts as the main action, then ways to bring in transactions by connecting a
bank or importing a file, and a way to restore a backup. It SHALL disappear once
the household has transactions.

#### Scenario: A new household's first sign-in
- **WHEN** a member of a new household opens the Overview
- **THEN** it says "Welcome. Let's set up your budget." with those actions

#### Scenario: After the first transactions
- **WHEN** the household's first transactions arrive
- **THEN** the Overview shows the normal tiles instead

### Requirement: Bank sync stopped reminder
When Enable Banking no longer accepts a household's credentials, Needs attention
SHALL show one line that opens the bank connections in Settings.

#### Scenario: Key no longer accepted
- **WHEN** a sync was refused because the household's key is no longer accepted
- **THEN** needs attention shows "Bank sync stopped: check your Enable Banking
  key", with no reconnect line caused by this

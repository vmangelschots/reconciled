# Spec Delta

## Purpose

A permanent, publicly reachable instance of the app filled with disposable demo
data, so the app can be shown and clicked through without exposing or risking a
real household.

## ADDED Requirements

### Requirement: The demo environment is separate from any real instance

The system SHALL run a demo instance at `https://reconciled-test.mangelschots.org`
with its own database, volume and credentials. It SHALL share no database,
Secret or storage with a production instance, and SHALL NOT hold real household
data.

#### Scenario: Demo data never reaches production
- **WHEN** a visitor adds an account or imports transactions on the demo hostname
- **THEN** no production instance sees that data, and the demo instance's own
  database is the only place it is stored

#### Scenario: Restarting keeps the demo data
- **WHEN** the demo instance's pods are deleted and recreated
- **THEN** the demo household and its transactions are still there

### Requirement: Demo data can be seeded on demand

The backend SHALL provide a command that creates a demo household with a login,
two current accounts, a savings account, transactions, bills, a monthly budget,
a yearly budget, a yearly target and a loan. The dates it creates SHALL be
relative to the day the command runs, and running it again SHALL NOT duplicate
the household. The command SHALL report the login it created.

#### Scenario: Seeding an empty installation
- **WHEN** the command runs against an installation with no households
- **THEN** a demo household exists with current-month bills and transactions,
  and the reported login can sign in

#### Scenario: Seeding twice changes nothing
- **WHEN** the command runs a second time against an already seeded installation
- **THEN** no duplicate household, accounts or transactions are created

### Requirement: Demo data resets daily

The demo environment SHALL replace its demo data once a day at a fixed time:
everything visitors entered SHALL be removed and the seeded household SHALL be
recreated with dates relative to that day. The app SHALL remain reachable
throughout, and the demo login SHALL work again after the reset.

#### Scenario: Visitor data disappears
- **WHEN** a visitor adds transactions, then the daily reset runs
- **THEN** those transactions are gone and the demo household matches a fresh
  seed for that day

#### Scenario: Login survives the reset
- **WHEN** the daily reset has finished
- **THEN** signing in with the documented demo credentials works

### Requirement: The demo environment has no real integrations

The demo environment SHALL run without Enable Banking credentials, without an
OpenAI key and without a scheduled bank sync, and SHALL NOT call those services.
Its login SHALL be documented publicly, and the environment SHALL be described
as disposable.

#### Scenario: Everything works without credentials
- **WHEN** the demo environment runs with no Enable Banking or OpenAI values
- **THEN** the seeded household can be viewed, budgets can be edited and files
  can be imported, with only history-based behaviour for categories

#### Scenario: No sync is scheduled
- **WHEN** the demo environment's jobs are listed
- **THEN** no bank-sync job exists, and the app does not claim a next sync time

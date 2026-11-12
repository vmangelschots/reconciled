# Spec Delta

## MODIFIED Requirements

### Requirement: Recent transactions
The overview SHALL list the 8 most recent transactions across the active
accounts, as the banks list them (split transactions once), each with
its date, payee, category and amount. Value adjustments SHALL NOT be
listed. With more than one active account,
each row SHALL show its account's name. A transfer between two of the
user's active accounts SHALL be listed once, as "<from> → <to>" with the
amount moved and no sign colour. A covered entry SHALL be listed once, by
its cost, with "Paid by <Tab>" in place of the account name, whatever the
number of accounts. "View all" SHALL open the last-opened account's
transactions.

#### Scenario: Last eight
- **WHEN** the accounts have 30 transactions between them
- **THEN** the overview lists the 8 most recent, newest first, each with
  its account name, and a "View all" link to Transactions

#### Scenario: A transfer shows once
- **WHEN** the most recent movement is 500.00 from "Revolut" to "Crelan"
- **THEN** one row reads "Revolut → Crelan" with €500.00, and the
  matching +500.00 in Crelan is not listed separately

#### Scenario: A covered entry shows once
- **WHEN** the newest entry is Sarah paying 15.00 for "Sushi Palace" in
  "Takeout"
- **THEN** one row reads "Sushi Palace", "Takeout", -€15.00 with "Paid by
  Sarah" linking to her tab, and the tab half is not listed

#### Scenario: Value adjustments are left out
- **WHEN** the newest entry is a value adjustment on "House"
- **THEN** it is not listed, and the 8 rows are the most recent other
  transactions

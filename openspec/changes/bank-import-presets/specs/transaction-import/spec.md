# Spec Delta

## MODIFIED Requirements

### Requirement: Map CSV columns
For a CSV file, the system SHALL let the user map file columns to the
transaction fields date, amount, and description, and optionally payee
and a separate debit/credit column pair. The system SHALL auto-detect
the file's column delimiter rather than assuming comma. The system
SHALL require the user to select the date column's format from a fixed
list of supported formats rather than guessing it. A date value followed
by a time SHALL parse with the selected format, and the time SHALL be
ignored. A CSV recognized as a bank export (see the
`bank-export-formats` capability) SHALL skip this step.

#### Scenario: Map a simple CSV export
- **WHEN** the user maps column "Posted Date" to date, "Amount" to
  amount, and "Description" to description
- **THEN** the system parses each row into a candidate transaction using
  that mapping

#### Scenario: Reject mapping with a missing required field
- **WHEN** the user attempts to proceed without mapping both date and
  amount
- **THEN** the system blocks the import and indicates which fields are
  still required

#### Scenario: Detect a semicolon-delimited export
- **WHEN** the user uploads a CSV file that uses semicolons rather than
  commas to separate columns
- **THEN** the system detects the semicolon delimiter and parses the
  file's columns correctly, without the user having to specify it

#### Scenario: Comma-delimited exports continue to work
- **WHEN** the user uploads a CSV file that uses commas to separate
  columns
- **THEN** the system parses it exactly as before

#### Scenario: Date format must be chosen explicitly
- **WHEN** the user maps a date column
- **THEN** the system requires them to also select that column's date
  format from the supported list before proceeding, and blocks the
  import with that field named as missing if they have not

#### Scenario: An ambiguous date parses correctly once the format is chosen
- **WHEN** the user selects "DD/MM/YYYY" as the date format for a column
  containing "01/10/2026"
- **THEN** the system parses that date as the 1st of October, not
  January 10th

#### Scenario: A date with a time
- **WHEN** the user selects "YYYY-MM-DD" for a column containing
  "2026-10-12 2:00:00"
- **THEN** the system parses that date as 12 October 2026

### Requirement: Detect likely duplicate transactions
The system SHALL mark a candidate transaction as a likely duplicate when
an existing transaction on the candidate's account has the same date,
the same amount, and a matching or highly similar description. Each
existing transaction SHALL mark at most one candidate of an import, the
first matching one in file order. Parts of a split transaction SHALL NOT
be compared; the split transaction itself SHALL be. An import SHALL
never change a split transaction or its parts.

#### Scenario: Flag a re-imported transaction
- **WHEN** the user re-imports a file containing a transaction that was
  already imported into the target account
- **THEN** the system marks the matching candidate as a likely duplicate
  and excludes it from the default commit selection

#### Scenario: User can override a duplicate flag
- **WHEN** the user explicitly re-includes a candidate marked as a likely
  duplicate
- **THEN** the system commits it as a new transaction when the import is
  confirmed

#### Scenario: A re-imported split transaction is a duplicate
- **WHEN** a -60.00 "Pizzeria" transaction was imported and then split
  into two -30.00 parts, and the same file is imported again
- **THEN** the -60.00 line is marked as a likely duplicate and the split
  is unchanged

#### Scenario: Parts are not duplicates
- **WHEN** an imported file contains a -30.00 "Pizzeria" line on the same
  date as a -30.00 part of a split "Pizzeria" transaction
- **THEN** the line is not marked as a duplicate

#### Scenario: Two identical payments on one day
- **WHEN** the account has one -7.80 "LAGO Mons" transaction on 11
  October, and an import has two -7.80 "LAGO Mons" lines on 11 October
- **THEN** the first line is marked as a likely duplicate and the second
  is not

#### Scenario: Both identical payments re-imported
- **WHEN** the account already has both -7.80 "LAGO Mons" transactions
  on 11 October, and the same two lines are imported again
- **THEN** both lines are marked as likely duplicates

### Requirement: Commit import
The system SHALL create a transaction for each candidate the user
confirms, on that candidate's account: the target account, or the
account a bank-export rule sent it to. It SHALL create no transactions
until the user confirms the import.

#### Scenario: Confirm an import
- **WHEN** the user reviews the preview and confirms the import with 18
  of 20 candidates selected (2 duplicates excluded)
- **THEN** the system creates exactly 18 transactions on the target
  account and the account's current balance reflects all of them

#### Scenario: An import into two accounts
- **WHEN** a Revolut import sends 26 Current lines to "Revolut" and 2
  Savings lines to "Revolut Pockets", and the user confirms all of them
- **THEN** 26 transactions are created in "Revolut" and 2 in "Revolut
  Pockets"

### Requirement: Committing an import auto-categorizes new transactions
When an import is committed, the system SHALL run the categorizer (see the
`auto-categorization` capability) over the transactions it creates. A line
that confirms a created transfer counterpart, or that is linked as a
pocket move (see the `bank-export-formats` capability), SHALL NOT be
categorized. The import's upload, mapping and preview steps SHALL NOT
show or ask about categories.

#### Scenario: Imported repeat payees arrive categorized
- **WHEN** the user commits an import of 20 lines, 14 of them from payees
  with confirmed history
- **THEN** those 14 transactions are created with unconfirmed categories
  and the other 6 are uncategorized

#### Scenario: A transfer confirmation stays a transfer
- **WHEN** a committed line confirms a created transfer counterpart
- **THEN** that transaction keeps its transfer link and gets no category

#### Scenario: A pocket move stays a transfer
- **WHEN** both sides of a Revolut pocket move are committed
- **THEN** both are linked as a transfer and neither gets a category

## ADDED Requirements

### Requirement: Remember the CSV mapping per account
After a CSV import is committed, the system SHALL remember its column
mapping and date format for the target account. On the next CSV upload
to that account, the mapping step SHALL preselect them, as long as every
remembered column is in the new file. Otherwise it SHALL start empty, as
today. The user SHALL be able to change a preselected choice.

#### Scenario: Second upload is preselected
- **WHEN** the user committed an import into "Joint" mapping "Posted
  Date" (DD/MM/YYYY), "Amount" and "Description", then uploads another
  file with the same columns to "Joint"
- **THEN** the mapping step shows those columns and DD/MM/YYYY already
  selected

#### Scenario: Different columns start empty
- **WHEN** the next file uploaded to "Joint" has no "Posted Date" column
- **THEN** the mapping step starts with nothing selected

#### Scenario: Remembered per account
- **WHEN** the user uploads a CSV to "Savings", which was never imported
  with a mapping
- **THEN** the mapping step starts with nothing selected

### Requirement: An import counts for every account it imports into
A committed import SHALL count as an import of each account it sent
lines to, even when all of that account's lines were duplicates or
unticked. This includes the target account and any account a Revolut
Product was sent to. A skipped Product's account SHALL NOT count.

#### Scenario: The pocket account is imported too
- **WHEN** on 24 October the user commits a Revolut import that sends
  Current to "Revolut" and Savings to "Revolut Pockets"
- **THEN** both accounts were last imported on 24 October, and neither
  shows a stale-import reminder

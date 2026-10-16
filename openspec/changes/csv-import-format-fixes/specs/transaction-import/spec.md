# Spec Delta

## MODIFIED Requirements

### Requirement: Map CSV columns
For a CSV file, the system SHALL let the user map file columns to the
transaction fields date, amount, and description, and optionally payee
and a separate debit/credit column pair. The system SHALL auto-detect
the file's column delimiter rather than assuming comma. The system
SHALL require the user to select the date column's format from a fixed
list of supported formats rather than guessing it.

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

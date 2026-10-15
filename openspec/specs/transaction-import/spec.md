# Transaction Import Specification

## Purpose

Transaction import lets the user bring existing transaction history into
the ledger by uploading a CSV or OFX bank export, instead of re-entering
every line by hand.

## Requirements

### Requirement: Upload a bank export file
The system SHALL allow the user to upload a file in CSV or OFX format and
associate it with a target account before any transactions are created.

#### Scenario: Upload a supported file
- **WHEN** the user uploads a `.csv` or `.ofx` file and selects "Main
  Checking" as the target account
- **THEN** the system accepts the file and proceeds to parsing

#### Scenario: Reject an unsupported file
- **WHEN** the user uploads a file that is neither CSV nor OFX
- **THEN** the system rejects the upload and explains which formats are
  supported

### Requirement: Map CSV columns
For a CSV file, the system SHALL let the user map file columns to the
transaction fields date, amount, and description, and optionally payee
and a separate debit/credit column pair.

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

### Requirement: Parse OFX files without manual mapping
For an OFX file, the system SHALL parse date, amount, payee, and
description directly from the file's standard fields without requiring
the user to map columns.

#### Scenario: Import a standard OFX file
- **WHEN** the user uploads a well-formed OFX file
- **THEN** the system parses its transactions automatically and proceeds
  to the preview step

### Requirement: Preview parsed transactions before committing
The system SHALL show the user a preview of all parsed candidate
transactions, each marked as new or as a likely duplicate, before any are
written to the ledger.

#### Scenario: Preview shows parsed rows
- **WHEN** parsing completes for an uploaded file
- **THEN** the system displays each candidate transaction's date, amount,
  and description, and whether it is marked as a likely duplicate

### Requirement: Detect likely duplicate transactions
The system SHALL mark a candidate transaction as a likely duplicate when
an existing transaction on the target account has the same date, the same
amount, and a matching or highly similar description.

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

### Requirement: Commit import
The system SHALL create a transaction on the target account for each
candidate the user confirms, and SHALL create no transactions until the
user confirms the import.

#### Scenario: Confirm an import
- **WHEN** the user reviews the preview and confirms the import with 18
  of 20 candidates selected (2 duplicates excluded)
- **THEN** the system creates exactly 18 transactions on the target
  account and the account's current balance reflects all of them

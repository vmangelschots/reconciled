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

### Requirement: Imported lines confirm created transfer counterparts
When an import's preview contains a line with the same amount as a
transfer counterpart the app created in the target account (not yet
confirmed), dated no more than 5 days from it, the system SHALL show
that line as matching the transfer, selected by default. Committing it
SHALL update the created counterpart with the line's date, payee and
description, mark it as confirmed, and keep the transfer link, instead of
creating a new transaction.

#### Scenario: Bank line replaces a created counterpart
- **WHEN** a transfer created +500.00 on 3 March in "Savings", and the
  user later imports a Savings export containing +500.00 on 4 March
- **THEN** the preview shows that line as matching the transfer from
  "Checking", and committing it leaves one +500.00 in Savings, dated 4
  March, with the bank's description and still linked to "Checking"

#### Scenario: Excluded match changes nothing
- **WHEN** the user unticks a line that matches a created counterpart and
  commits
- **THEN** the created counterpart stays as it was and no new transaction
  is added for that line

### Requirement: Committing an import auto-categorizes new transactions
When an import is committed, the system SHALL run the categorizer (see the
`auto-categorization` capability) over the transactions it creates. A line
that confirms a created transfer counterpart SHALL NOT be categorized. The
import's upload, mapping and preview steps SHALL NOT show or ask about
categories.

#### Scenario: Imported repeat payees arrive categorized
- **WHEN** the user commits an import of 20 lines, 14 of them from payees
  with confirmed history
- **THEN** those 14 transactions are created with unconfirmed categories
  and the other 6 are uncategorized

#### Scenario: A transfer confirmation stays a transfer
- **WHEN** a committed line confirms a created transfer counterpart
- **THEN** that transaction keeps its transfer link and gets no category

### Requirement: Import summary points to the review
After a commit that categorized at least one transaction, the import's
summary SHALL say how many were categorized, split by source when AI
contributed, and link to the Review page. It SHALL also say when AI didn't
respond, when the API key was rejected (naming the key setting), and how
many new payees AI couldn't guess. With nothing categorized and nothing to
report about AI, the summary SHALL show only the created count.

#### Scenario: Summary links to review
- **WHEN** an import commits 20 transactions and 14 of them were
  categorized from history
- **THEN** the summary says 14 were categorized from your history, with a
  link to the Review page

#### Scenario: Summary splits history and AI
- **WHEN** an import commits 20 transactions, 10 categorized from history
  and 4 by AI
- **THEN** the summary says 14 got a category, 10 from your history and 4
  by AI, with a link to the Review page

#### Scenario: AI didn't respond
- **WHEN** an import commits 20 transactions, 10 categorized from history,
  and the AI request timed out
- **THEN** the summary says 10 got a category from your history and that
  AI guessing didn't respond, so it can be retried from Review

#### Scenario: Payees AI couldn't guess
- **WHEN** AI declined 3 of the new payees in an import
- **THEN** the summary says 3 new payees couldn't be guessed

#### Scenario: No line when nothing was categorized
- **WHEN** an import commits 6 transactions, none were categorized, and AI
  isn't configured
- **THEN** the summary shows only the created count

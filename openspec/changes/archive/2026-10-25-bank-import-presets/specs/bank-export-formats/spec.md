# Spec Delta

## Purpose

Recognizes the CSV exports of the banks the household uses (Revolut and
Crelan) and turns their rows into transactions without manual column
mapping, including sending Revolut's pockets to their own accounts.

## ADDED Requirements

### Requirement: Recognize a bank export by its header
On upload, the system SHALL recognize a CSV file as a Revolut or Crelan
export when its header row has that bank's columns. A recognized file
SHALL skip column mapping. Its preview SHALL name the bank. A file that
is not recognized SHALL go through column mapping as before.

#### Scenario: A Revolut export skips mapping
- **WHEN** the user uploads a CSV whose header is "Type,Product,Started
  Date,Completed Date,Description,Amount,Fee,Currency,State,Balance"
- **THEN** no column mapping is asked for, and the preview says it was
  recognized as a Revolut export

#### Scenario: A Crelan export skips mapping
- **WHEN** the user uploads a CSV whose header is
  "Datum;Bedrag;Saldo na verrichting;Munt;Tegenpartij;Rekening
  tegenpartij;Type verrichting;Mededeling;Rekening opdrachtgever"
- **THEN** no column mapping is asked for, and the preview says it was
  recognized as a Crelan export

#### Scenario: Other files are mapped as before
- **WHEN** the user uploads a CSV with the header "Posted
  Date,Amount,Description"
- **THEN** the column mapping step is shown

### Requirement: Crelan rows
For a Crelan export, each row SHALL become a transaction:
- date from "Datum" as DD/MM/YYYY
- amount from "Bedrag"
- payee from "Tegenpartij", or else "Mededeling", or else "Type
  verrichting", whichever is filled in first
- description from "Mededeling", or else "Type verrichting"

#### Scenario: A row with a counterparty
- **WHEN** a Crelan row has Datum "01/10/2026", Bedrag "-21.85",
  Tegenpartij "Ethias" and Mededeling "Verzekeringstaks"
- **THEN** its candidate is dated 1 October 2026, -21.85, with payee
  "Ethias" and description "Verzekeringstaks"

#### Scenario: A row without a counterparty or communication
- **WHEN** a Crelan row has an empty Tegenpartij and Mededeling, and Type
  verrichting "Beheerskosten"
- **THEN** its candidate has payee and description "Beheerskosten"

### Requirement: Revolut rows
For a Revolut export, each row SHALL become a transaction:
- date: the date part of "Started Date"
- amount: "Amount" minus "Fee"
- payee and description: from "Description"
Rows whose "State" is not COMPLETED SHALL be left out.

#### Scenario: A card payment uses the day it was made
- **WHEN** a Revolut row has Started Date "2026-09-30 7:25:54", Completed
  Date "2026-10-01 9:52:59", Amount "-3.6", Fee "0" and Description
  "Vanalles & Nogwat"
- **THEN** its candidate is dated 30 September 2026, -3.60, with payee
  "Vanalles & Nogwat"

#### Scenario: The fee is part of the amount
- **WHEN** a Revolut row has Amount "-50" and Fee "1.5"
- **THEN** its candidate's amount is -51.50

#### Scenario: Unfinished rows are left out
- **WHEN** a Revolut export has rows with State "PENDING", "REVERTED" and
  "DECLINED" next to COMPLETED rows
- **THEN** only the COMPLETED rows appear in the preview

### Requirement: Send Revolut products to accounts
When a Revolut export has rows for more than one "Product", the system
SHALL ask, before the preview, which active account each Product goes
to, or that it is skipped. The rows of each Product SHALL be imported
into its chosen account. Rows of a skipped Product SHALL be left out. A
file with only one Product SHALL go to the upload's account without
asking.

#### Scenario: Current and Savings in one file
- **WHEN** the user uploads a Revolut export with Current and Savings
  rows to "Revolut", and sends Savings to "Revolut Pockets"
- **THEN** the preview lists the Current rows under "Revolut" and the
  Savings rows under "Revolut Pockets"

#### Scenario: Skip a product
- **WHEN** the user chooses to skip Savings
- **THEN** the preview lists only the Current rows

#### Scenario: Only the current account
- **WHEN** a Revolut export only has Current rows
- **THEN** no Product question is asked and the rows go to the upload's
  account

### Requirement: Remember where Revolut products go
The Product question SHALL preselect "Current" with the upload's account.
For any other Product, it SHALL preselect the account (or the skip) that
was chosen for it the last time a Revolut file was imported into the
same upload account. A Product with no earlier choice SHALL have nothing
preselected, and the user SHALL have to choose before continuing.

#### Scenario: The second import remembers
- **WHEN** Savings was sent to "Revolut Pockets" in the last Revolut
  import into "Revolut", and the user uploads a new Revolut export to
  "Revolut"
- **THEN** Savings is preselected as "Revolut Pockets"

#### Scenario: A new product must be chosen
- **WHEN** a Revolut export has a Product "Investments" that was never
  imported before
- **THEN** it has no preselected account and the user can't continue
  until they choose one or skip it

### Requirement: Link Revolut pocket moves as transfers
When one row of a Revolut import goes to one account and another row
goes to a different account, the two rows SHALL form a pocket move if
they have the same Started Date and time and opposite amounts. Both
SHALL be shown in the preview as a transfer to or from the other
account. Committing both SHALL create them as a linked transfer, with no
category. Committing only one SHALL create it as a normal transaction.

#### Scenario: Money moved into a pocket
- **WHEN** a Revolut import sends Current to "Revolut" and Savings to
  "Revolut Pockets", and both have a row started "2026-10-22 19:54:58",
  "To pocket EUR Electricity from EUR", of -350 and +350
- **THEN** the preview shows the -350.00 as "→ Revolut Pockets" and the
  +350.00 as "← Revolut", and after committing they are linked as a
  transfer and neither has a category

#### Scenario: Only one side committed
- **WHEN** the user unticks the +350.00 Savings side of a pocket move and
  commits
- **THEN** the -350.00 is created in "Revolut" as a normal, unlinked
  transaction

#### Scenario: A pocket pays a bill
- **WHEN** a Savings row "Luminus SA" of -254.72 has no opposite row at
  the same time
- **THEN** it is imported into "Revolut Pockets" as a normal transaction

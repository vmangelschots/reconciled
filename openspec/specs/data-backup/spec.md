# data-backup Specification

## Purpose

Lets the user download their whole budget as one backup file from the app,
and later put the app back exactly as that file describes, without server
access.

## Requirements

### Requirement: Download a backup
The Settings page SHALL offer a Download backup button that downloads one
JSON file named `reconciled-backup-YYYY-MM-DD.json` after the day it was
made. The file SHALL record when it was made, its backup format version and
the app's database version, and how many accounts and transactions it holds.
Only a signed-in user SHALL be able to download one.

#### Scenario: Download a backup
- **WHEN** the user presses Download backup on 25 October 2026
- **THEN** the browser saves `reconciled-backup-2026-10-25.json`, and a
  success notification confirms it

#### Scenario: Not signed in
- **WHEN** a request for a backup comes without a signed-in session
- **THEN** it is refused and no data is returned

### Requirement: What a backup holds
A backup SHALL hold every account; every transaction, with its splits,
transfer links, value adjustments, notes and category guesses; categories
and tabs; monthly limits; yearly budgets; the budget settings; recurring
transactions; loan setups, with the links between scheduled adjustments
and their installments and payments; the remembered import mappings; and
when each account was last imported into. Rows SHALL keep their ids and
their created and updated times.

#### Scenario: A transfer and a split survive a round trip
- **WHEN** the data holds a transfer from Crelan to Revolut and a
  supermarket line split into Groceries and Household, and the user
  downloads a backup and restores it
- **THEN** the two transfer sides are still linked to each other, and the
  split still has its two parts with their categories

#### Scenario: Last-import dates survive
- **WHEN** Crelan was last imported into on 20 October and a backup made
  after that is restored
- **THEN** the Overview still shows Crelan as last imported on 20 October

#### Scenario: An AI guess stays a guess
- **WHEN** a transaction has an unconfirmed AI category with its reason, and
  a backup of it is restored
- **THEN** the transaction is still waiting in Review with the same guess
  and reason

#### Scenario: A loan schedule survives
- **WHEN** "Mortgage" has a loan setup and a scheduled adjustment matched
  to a payment in Crelan, and a backup of it is restored
- **THEN** the setup has the same terms, the adjustment is still that
  installment's and linked to the same payment, and no adjustment is
  posted twice

### Requirement: What a backup leaves out
A backup SHALL NOT hold login users or their passwords. It SHALL NOT hold
imports that were never committed, or the content of any uploaded bank file.

#### Scenario: No users in the file
- **WHEN** the user downloads a backup
- **THEN** the file contains no usernames or password hashes

#### Scenario: An unfinished import is left out
- **WHEN** a CSV was uploaded but its import was never committed, and the
  user downloads a backup
- **THEN** the backup has neither that import nor the file's lines

### Requirement: Check a backup before restoring
After the user picks a file to restore, the Settings page SHALL show what
the file holds before anything changes: when it was made and how many
accounts and transactions it has. It SHALL warn that restoring replaces
everything now in the app. Nothing SHALL change until the user confirms.
Cancelling SHALL leave the data as it was.

#### Scenario: Confirm shows what the file holds
- **WHEN** the user picks a backup made on 20 October 2026 with 3 accounts
  and 1,204 transactions
- **THEN** a confirmation shows "Made 20 Oct 2026 · 3 accounts · 1,204
  transactions" and warns that everything in the app will be replaced

#### Scenario: Not a backup
- **WHEN** the user picks a file that isn't a Reconciled backup, such as a
  bank CSV
- **THEN** an error says the file isn't a Reconciled backup, and no
  confirmation is offered

#### Scenario: Cancel
- **WHEN** the user cancels the confirmation
- **THEN** nothing in the app changes

### Requirement: Restore replaces everything
A confirmed restore SHALL delete all of the user's data that a backup holds,
plus any unfinished imports, and put back exactly the backup's data. Rows
created after the restore SHALL NOT clash with restored ids. The signed-in
user SHALL stay signed in. Afterwards the app SHALL show the restored data
and confirm with the number of accounts and transactions restored.

#### Scenario: Restore an older backup
- **WHEN** the app holds 1,250 transactions and the user restores a backup
  holding 1,204
- **THEN** the app holds exactly the backup's 1,204 transactions, and a
  notification says "Restored 3 accounts and 1,204 transactions"

#### Scenario: Adding data after a restore
- **WHEN** the user adds a transaction right after a restore
- **THEN** it is saved normally, with no id clash

#### Scenario: Still signed in
- **WHEN** a restore finishes
- **THEN** the user is still signed in and lands on the restored data
  without having to sign in again

### Requirement: A restore is all or nothing
The system SHALL check the whole file before changing anything. If the file
is damaged, incomplete or holds data that can't be saved, or if any step of
the restore fails, the system SHALL leave the app's data exactly as it was
and report the reason.

#### Scenario: A damaged file
- **WHEN** the user restores a backup whose JSON was cut off halfway
- **THEN** an error says the backup can't be read, and every account and
  transaction is still there as before

#### Scenario: A row that can't be saved
- **WHEN** a backup holds a transaction pointing at an account that isn't in
  the file
- **THEN** the restore fails with an error, and the app's data is unchanged

### Requirement: Backups across app versions
A backup made by this version of the app or an older one SHALL restore,
with any data added since then taking its default. A backup made by a newer
version, or with a backup format version this app doesn't know, SHALL be
refused before anything changes, with a message to update the app first.

#### Scenario: Backup from an older version
- **WHEN** a backup made before a later version added a new transaction
  field is restored
- **THEN** it restores, and the new field holds its default for every
  restored transaction

#### Scenario: Backup from a newer version
- **WHEN** the user restores a backup made by a newer version of the app
- **THEN** it is refused with "This backup was made by a newer version of
  Reconciled. Update the app, then restore it.", and nothing changes

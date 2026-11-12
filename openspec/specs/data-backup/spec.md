# data-backup Specification

## Purpose

Lets the user download their whole budget as one backup file from the app,
and later put the app back exactly as that file describes, without server
access.

## Requirements

### Requirement: Download a backup
The Settings page SHALL offer a Download backup button that downloads one
JSON file named `reconciled-backup-YYYY-MM-DD.json` after the day it was
made, holding the signed-in user's household only. The file SHALL record when it
was made, its backup format version, the app's database version, the household's
name, and how many accounts and transactions it holds. Only a signed-in user
SHALL be able to download one.

#### Scenario: Download a backup
- **WHEN** the user presses Download backup on 25 October 2026
- **THEN** the browser saves `reconciled-backup-2026-10-25.json`, and a
  success notification confirms it

#### Scenario: Not signed in
- **WHEN** a request for a backup comes without a signed-in session
- **THEN** it is refused and no data is returned

#### Scenario: Only this household
- **WHEN** a member of one household downloads a backup while another household
  has data
- **THEN** the file holds nothing from the other household

### Requirement: What a backup holds
A backup SHALL hold every account; every transaction, with its splits,
transfer links, value adjustments, notes and category guesses; categories
and tabs; monthly limits; yearly budgets; bills; the budget settings; recurring
transactions; loan setups and their balance corrections, with the links
between scheduled adjustments and their installments, corrections and
payments; the remembered import mappings; when each account was last
imported into; and bank account links with their seen bank lines. Rows SHALL keep
their created and updated times and every link between them, but restored rows
SHALL get new ids.

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

#### Scenario: A correction survives
- **WHEN** "Mortgage" has a balance correction with a chosen payment, and
  a backup of it is restored
- **THEN** the correction has the same date, amount and payment, its
  adjustment is still linked to it, and the schedule is the same as
  before

#### Scenario: A deleted line stays deleted after a restore
- **WHEN** a synced line was deleted before a backup was made, and that
  backup is restored and the bank reports the line again
- **THEN** it is not created again

#### Scenario: Remembered account mappings survive
- **WHEN** an import mapping sends a Revolut product to "Revolut Pockets", and a
  backup of it is restored
- **THEN** the mapping still points at the restored "Revolut Pockets"

#### Scenario: Bills survive
- **WHEN** "Streaming" is a Bills category with Netflix 17.99 on the 5th,
  and a backup of it is restored
- **THEN** "Streaming" is still a Bills category with Netflix 17.99 on the
  5th, counting from the same month

#### Scenario: A backup from before bills
- **WHEN** a backup made before bills existed is restored
- **THEN** it restores, with no bills

### Requirement: What a backup leaves out
A backup SHALL NOT hold login users or their passwords. It SHALL NOT hold
imports that were never committed, the content of any uploaded bank file,
bank sessions, Enable Banking credentials or the household's AI choice. A restore
SHALL leave the household's credentials and AI choice as they are.

#### Scenario: No users in the file
- **WHEN** the user downloads a backup
- **THEN** the file contains no usernames or password hashes

#### Scenario: An unfinished import is left out
- **WHEN** a CSV was uploaded but its import was never committed, and the
  user downloads a backup
- **THEN** the backup has neither that import nor the file's lines

#### Scenario: Reconnect after a restore
- **WHEN** a backup with a link from "Crelan" to a bank account is restored
- **THEN** the link is kept, shows as needing to reconnect, and reconnecting
  that bank resumes it, so no bank access came from the file

#### Scenario: Credentials and AI choice stay
- **WHEN** a household with Enable Banking credentials and AI turned off restores
  a backup
- **THEN** the credentials still work and AI stays off

### Requirement: Check a backup before restoring
After the user picks a file to restore, the Settings page SHALL show what
the file holds before anything changes: when it was made and how many
accounts and transactions it has, plus the household's name if it came from
another household. It SHALL warn that restoring replaces everything in this
household for all its members. Nothing SHALL change until the user confirms.
Cancelling SHALL leave the data as it was.

#### Scenario: Confirm shows what the file holds
- **WHEN** the user picks a backup made on 20 October 2026 with 3 accounts
  and 1,204 transactions
- **THEN** a confirmation shows "Made 20 Oct 2026 · 3 accounts · 1,204
  transactions" and warns that everything in this household is replaced for all
  its members, and that other households aren't touched

#### Scenario: A backup from another household
- **WHEN** the user picks a backup made by "The Peeters household" from a
  different household
- **THEN** the confirmation shows "Made 20 Oct 2026 · The Peeters household · 3
  accounts · 1,204 transactions"

#### Scenario: Not a backup
- **WHEN** the user picks a file that isn't a Reconciled backup, such as a
  bank CSV
- **THEN** an error says the file isn't a Reconciled backup, and no
  confirmation is offered

#### Scenario: Cancel
- **WHEN** the user cancels the confirmation
- **THEN** nothing in the app changes

### Requirement: Restore replaces everything
A confirmed restore SHALL delete all of the household's data that a backup holds,
plus its unfinished imports, and put back exactly the backup's data in that
household. It SHALL NOT change another household's data, whatever the file holds.
Rows created after the restore SHALL NOT clash with restored ids. The signed-in
user SHALL stay signed in. Afterwards the app SHALL show the restored data
and confirm with the number of accounts and transactions restored.

#### Scenario: Restore an older backup
- **WHEN** the household holds 1,250 transactions and the user restores a backup
  holding 1,204
- **THEN** the household holds exactly the backup's 1,204 transactions, and a
  notification says "Restored 3 accounts and 1,204 transactions. Reconnect your
  banks in Settings."

#### Scenario: Adding data after a restore
- **WHEN** the user adds a transaction right after a restore
- **THEN** it is saved normally, with no id clash

#### Scenario: Still signed in
- **WHEN** a restore finishes
- **THEN** the user is still signed in and lands on the restored data
  without having to sign in again

#### Scenario: Other households are untouched
- **WHEN** one household restores a backup while another household has data
- **THEN** the other household's data is exactly as it was

#### Scenario: A restore during a sync
- **WHEN** a member restores a backup while their household's sync is running
- **THEN** the restore is refused with a message and nothing changes

#### Scenario: Restoring from a stale tab
- **WHEN** a user restores a backup in a tab showing a household that's no longer
  the active one
- **THEN** the restore is refused and neither household changes

#### Scenario: A remembered account no longer exists
- **WHEN** the selected account in the browser was removed by a restore
- **THEN** the app falls back to its default account view

### Requirement: A restore is all or nothing
The system SHALL check the whole file before changing anything. If the file
is damaged, incomplete or holds data that can't be saved, or if any step of
the restore fails, the system SHALL leave the app's data exactly as it was
and report the reason. A row pointing at anything outside the file SHALL count as
data that can't be saved.

#### Scenario: A damaged file
- **WHEN** the user restores a backup whose JSON was cut off halfway
- **THEN** an error says the backup can't be read, and every account and
  transaction is still there as before

#### Scenario: A row that can't be saved
- **WHEN** a backup holds a transaction pointing at an account that isn't in
  the file
- **THEN** the restore fails with an error, and the app's data is unchanged

#### Scenario: A file aimed at another household
- **WHEN** an edited backup holds a row pointing at an id of another household's
  account
- **THEN** the restore fails with an error, and neither household changes

### Requirement: Backups across app versions
A backup made by this version of the app or an older one SHALL restore into the
user's household, with any data added since then taking its default. A backup made
by a newer version, or with a backup format version this app doesn't know, SHALL be
refused before anything changes, with a message to update the app first.

#### Scenario: Backup from an older version
- **WHEN** a backup made before a later version added a new transaction
  field is restored
- **THEN** it restores, and the new field holds its default for every
  restored transaction

#### Scenario: Backup from before households
- **WHEN** a backup made before households existed is restored
- **THEN** it restores into the user's household

#### Scenario: Backup from a newer version
- **WHEN** the user restores a backup made by a newer version of the app
- **THEN** it is refused with "This backup was made by a newer version of
  Reconciled. Update the app, then restore it.", and nothing changes

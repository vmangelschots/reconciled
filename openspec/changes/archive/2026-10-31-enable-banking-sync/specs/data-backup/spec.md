# Spec Delta

## MODIFIED Requirements

### Requirement: What a backup holds
A backup SHALL hold every account; every transaction, with its splits,
transfer links, value adjustments, notes and category guesses; categories
and tabs; monthly limits; yearly budgets; the budget settings; recurring
transactions; loan setups and their balance corrections, with the links
between scheduled adjustments and their installments, corrections and
payments; the remembered import mappings; when each account was last
imported into; and bank account links with their seen bank lines. Rows SHALL keep their ids and their created and updated
times.

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

### Requirement: What a backup leaves out
A backup SHALL NOT hold login users or their passwords. It SHALL NOT hold
imports that were never committed, the content of any uploaded bank file,
bank sessions or Enable Banking credentials.

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

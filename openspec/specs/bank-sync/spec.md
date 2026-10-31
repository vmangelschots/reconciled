# bank-sync Specification

## Purpose

Keeps the ledger current by fetching new lines from the household's banks
through Enable Banking and posting them straight into linked accounts,
without uploading a file or confirming a preview.

## Requirements

### Requirement: Bank sync is optional
Bank sync SHALL be available only when Enable Banking credentials are
configured. Without them, Settings SHALL say that bank sync isn't set up,
no sync SHALL run, and the rest of the app SHALL work as before.

#### Scenario: No credentials
- **WHEN** the app runs without Enable Banking credentials
- **THEN** Settings says bank sync isn't set up and the scheduled sync ends
  without contacting anything

### Requirement: Connect a bank
Settings SHALL let the user pick a bank and go through that bank's
authorization. Coming back SHALL create a connection that lists the
accounts the bank gave access to, and when its consent ends. A denied or
failed authorization SHALL create no connection and say why.

#### Scenario: Authorize Crelan
- **WHEN** the user picks Crelan and approves access at the bank
- **THEN** they return to Settings, which shows the Crelan connection, its
  accounts and the date its consent ends

#### Scenario: Authorization is denied
- **WHEN** the user cancels at the bank
- **THEN** they return to Settings with a message and no connection exists

### Requirement: Link a bank account to a ledger account
The user SHALL be able to link a bank account to one active ledger account
and choose a start date, which SHALL default to the day after that
account's latest transaction. A bank account that isn't linked SHALL NOT be
fetched. A ledger account SHALL have at most one link.

#### Scenario: Link with the default start date
- **WHEN** the last transaction in "Crelan" is dated 20 October and the
  user links the bank account to it
- **THEN** the start date is preselected as 21 October and can be changed

#### Scenario: An unlinked account is left alone
- **WHEN** a connection offers two bank accounts and only one is linked
- **THEN** only that account's lines reach the ledger

### Requirement: Scheduled and manual sync
The system SHALL sync every linked account on a schedule, and when the user
presses Sync now in Settings. Syncs SHALL never run at the same time.
Settings SHALL show each link's last successful sync and how many lines it
added.

#### Scenario: Sync now
- **WHEN** the user presses Sync now and 3 new lines are available
- **THEN** the 3 lines are in the ledger and Settings shows the sync time
  and 3 lines added

#### Scenario: Sync pressed during a scheduled run
- **WHEN** a sync is running and the user presses Sync now
- **THEN** no second sync runs and no line is added twice

### Requirement: New lines go straight into the ledger
A sync SHALL create a transaction for each new booked line dated on or
after the link's start date, without asking the user. It SHALL ignore
pending lines, lines dated before the start date, and zero amounts.

#### Scenario: A booked line arrives
- **WHEN** the bank reports a booked -21.85 line dated 25 October on a link
  that started on 21 October
- **THEN** a -21.85 transaction dated 25 October is in the linked account
  with no user action

#### Scenario: A pending line waits
- **WHEN** the bank reports a line as pending
- **THEN** nothing is created until the bank reports it as booked

#### Scenario: A line before the start date
- **WHEN** the bank reports a line dated 18 October on a link that started
  on 21 October
- **THEN** it is ignored

### Requirement: Turn a bank line into a transaction
The date SHALL be the day the payment was made when the bank reports it,
otherwise the booking date. The amount SHALL be negative for a debit, and
include any fee in the amount the account was charged. The payee SHALL be
the counterparty's name, or otherwise the payment's communication. Text
different from the payee SHALL go to the notes.

#### Scenario: An outgoing payment with a counterparty
- **WHEN** a debit line of 21.85 has the creditor "Ethias" and the
  communication "Verzekeringstaks"
- **THEN** its transaction is -21.85 with payee "Ethias" and notes
  "Verzekeringstaks"

#### Scenario: No counterparty
- **WHEN** a line has no counterparty and the communication "Beheerskosten"
- **THEN** its payee is "Beheerskosten" and it has no notes

### Requirement: A bank line is only added once
The system SHALL identify a line by its bank reference within its bank
account, or, when the bank gives none, by its date, amount, payee and
position among identical lines of that day. Every line seen SHALL be
remembered across syncs and reconnections, so a seen line SHALL NOT be
created again, even after its transaction was deleted.

#### Scenario: A line in two syncs
- **WHEN** two syncs both report the same line
- **THEN** one transaction exists

#### Scenario: Two identical payments
- **WHEN** a sync reports two -7.80 "LAGO Mons" lines on 11 October with
  different bank references
- **THEN** two transactions are created

#### Scenario: A deleted line stays deleted
- **WHEN** the user deletes a synced transaction and the next sync reports
  that line again
- **THEN** it is not created again

#### Scenario: A split line
- **WHEN** a synced -60.00 line was split into two parts and the next sync
  reports it again
- **THEN** the split is unchanged and nothing is created

#### Scenario: After reconnecting
- **WHEN** a consent ended, the user reconnected the bank and the bank
  reports lines that were already synced
- **THEN** none of them are created again

### Requirement: Adopt a line already in the ledger
When a new bank line has the same date and amount and a similar payee as a
transaction in the linked account that no bank line was matched to, the
system SHALL match the line to that transaction, not create another, and
leave the transaction unchanged. Each transaction SHALL match at most one
line.

#### Scenario: A hand-entered payment
- **WHEN** the user entered -12.00 "Bakker" on 25 October by hand, and a
  sync reports that line
- **THEN** one transaction exists and the bank line counts as seen

#### Scenario: A CSV uploaded to a linked account
- **WHEN** a Crelan CSV committed yesterday holds a line that a sync reports
  today
- **THEN** no second transaction is created

#### Scenario: An existing line is only used once
- **WHEN** one -7.80 "LAGO Mons" of 11 October was entered by hand, and a
  sync reports two such lines with different bank references
- **THEN** the first is matched to it and the second is created

### Requirement: Synced lines confirm created transfer counterparts
A new line SHALL confirm a transfer counterpart created in the linked
account (not yet confirmed) with the same amount, dated no more than 5 days
from it, the closest date first. Confirming SHALL update its date, payee
and notes from the line and keep the transfer link, and SHALL count as
confirmed by an import. No new transaction SHALL be created.

#### Scenario: Bank line replaces a created counterpart
- **WHEN** a transfer created +500.00 on 3 March in "Savings", and a sync of
  "Savings" reports +500.00 on 4 March
- **THEN** there is one +500.00 in "Savings", dated 4 March, with the bank's
  payee, still linked to "Checking"

### Requirement: Link transfers between linked accounts
After a sync, a new line SHALL be linked as a transfer with a line of the
opposite amount in another linked account, dated no more than 5 days from
it, only when each is the other's single match. Both SHALL have no category
afterwards. A line that doesn't qualify SHALL stay a normal transaction.

#### Scenario: A top-up between two banks
- **WHEN** a sync reports -200.00 in "Crelan" on 3 March and +200.00 in
  "Revolut" on 4 March, with no other line of that amount
- **THEN** the two are linked as a transfer and neither has a category

#### Scenario: The other side arrived in an earlier sync
- **WHEN** +200.00 in "Revolut" was synced yesterday and has an unconfirmed
  guess, and today's sync reports -200.00 in "Crelan"
- **THEN** they are linked and the guess is gone

#### Scenario: More than one possible match
- **WHEN** a sync reports -50.00 in "Crelan", and "Revolut" has two +50.00
  lines within 5 days
- **THEN** nothing is linked and all three stay normal transactions

#### Scenario: Two lines for one match
- **WHEN** "Crelan" has two new -50.00 lines and "Revolut" one +50.00 line
  within 5 days
- **THEN** nothing is linked

### Requirement: Automatic links leave the user's choices alone
Automatic transfer linking SHALL NOT use a line with a confirmed category,
a split or a part of one, a line already linked, a line matched to a loan
payment, or a line in an account that has no link.

#### Scenario: A confirmed category is kept
- **WHEN** +200.00 in "Revolut" has a category the user confirmed, and a
  sync reports -200.00 in "Crelan" within 5 days
- **THEN** nothing is linked and the category stays

#### Scenario: A wrong link can be undone
- **WHEN** the user chooses a category for an automatically linked line
- **THEN** it is unlinked as any transfer is, and the next sync doesn't link
  it again

### Requirement: Categorize after a sync
After a sync, the categorizer SHALL run over the new transactions that
didn't become or confirm a transfer, and loan payments SHALL be matched as
after an import. A failing or slow categorizer SHALL NOT undo the sync; its
lines SHALL stay uncategorized and can be guessed from the Review page.

#### Scenario: Repeat payees arrive categorized
- **WHEN** a sync adds 5 lines, 3 from payees with confirmed history
- **THEN** those 3 wait on the Review page as unconfirmed guesses

#### Scenario: AI doesn't respond
- **WHEN** a sync adds lines and the AI request times out
- **THEN** the lines stay in the ledger and the Review page can guess them

### Requirement: Sync failures are contained
A failure on one linked account SHALL NOT stop the others or undo lines
already added. Each link SHALL keep its last error for Settings to show, and
the next sync SHALL pick up what was missed, including lines from a period
that failed. A bank's rate limit SHALL be treated as such a failure.

#### Scenario: One bank is down
- **WHEN** a sync can't reach Crelan but can reach Revolut
- **THEN** Revolut's lines are added, Settings shows the Crelan error, and
  the next sync adds the Crelan lines missed

### Requirement: Reconnect a bank
A connection whose consent has ended SHALL show as ended, and its links
SHALL not sync. Reconnecting SHALL keep each link when the bank offers the
same bank account again, with its start date, seen lines and ledger account,
and SHALL fetch what was missed.

#### Scenario: Reconnect after the consent ended
- **WHEN** Crelan's consent ended on 1 May and the user reconnects on 5 May
- **THEN** the link to "Crelan" is kept without choosing anything again, and
  lines from 1 to 5 May are added

#### Scenario: The bank ends consent early
- **WHEN** the bank rejects a sync because the session has expired
- **THEN** the connection shows as ended

### Requirement: Disconnect a bank
The user SHALL be able to disconnect a bank, which SHALL end its session at
Enable Banking and remove its links. Transactions already synced SHALL stay.
An archived ledger account SHALL NOT sync, and lose nothing, while archived.

#### Scenario: Disconnect
- **WHEN** the user disconnects Crelan
- **THEN** no more Crelan lines arrive and all synced Crelan transactions
  stay in the ledger

#### Scenario: Archive a linked account
- **WHEN** "Crelan" is archived
- **THEN** its link doesn't sync until it is unarchived

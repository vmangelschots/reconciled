# bank-sync Specification

## Purpose

Keeps the ledger current by fetching new lines from the household's banks
through Enable Banking and posting them straight into linked accounts,
without uploading a file or confirming a preview.

## Requirements

### Requirement: Bank sync is optional
Bank sync SHALL be available to a household only when it has working Enable
Banking credentials. Without them, the Bank connections section in Settings SHALL
offer the setup, no sync SHALL run for that household, and the rest of the app
SHALL work as before.

#### Scenario: No credentials
- **WHEN** a household has no Enable Banking credentials
- **THEN** Settings says "Connect your bank to get new transactions
  automatically. Setup takes about 15 minutes." and offers the setup steps, and
  the scheduled sync contacts nothing for that household

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
The system SHALL sync every household's linked accounts on a schedule, using that
household's own credentials, and when a member presses Sync now in Settings. Syncs
of one household SHALL never run at the same time, and SHALL NOT wait for another
household's. Settings SHALL show each link's last successful sync and how many
lines it added.

#### Scenario: Sync now
- **WHEN** the user presses Sync now and 3 new lines are available
- **THEN** the 3 lines are in the ledger and Settings shows the sync time
  and 3 lines added

#### Scenario: Sync pressed during a scheduled run
- **WHEN** a sync is running and the user presses Sync now
- **THEN** no second sync runs and no line is added twice

#### Scenario: Another household is syncing
- **WHEN** one household's sync is running and a member of another presses Sync
  now
- **THEN** their sync runs

#### Scenario: One household's credentials fail
- **WHEN** the scheduled sync can't use one household's credentials
- **THEN** every other household still syncs

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

### Requirement: Credentials belong to a household
Each household SHALL use its own Enable Banking application ID and private key,
stored encrypted. The private key SHALL never be returned or shown after it is
saved, and SHALL NOT appear in logs, backups or Django admin.

#### Scenario: After saving the key
- **WHEN** a member saves the private key and reopens Settings
- **THEN** Settings shows "Key saved. It can't be shown again." and the key is
  in no response from the server

### Requirement: Guided Enable Banking setup
Until credentials work, Settings SHALL show numbered steps: create an Enable
Banking account, add a production application using the exact redirect URL shown,
link the bank accounts in the Control Panel, then upload the key file. Once ready,
the steps SHALL collapse to one line.

#### Scenario: Copying the redirect URL
- **WHEN** a member copies the redirect URL
- **THEN** they get the same URL the bank authorization will use, and a
  notification says "Copied."

#### Scenario: Copying isn't available
- **WHEN** the browser can't copy to the clipboard
- **THEN** the URL is selected and a message says "Press Ctrl+C"

#### Scenario: Uploading the key file
- **WHEN** a member uploads `<application-id>.pem`
- **THEN** the application ID is filled in from the file name and can be edited

#### Scenario: Pasting the key
- **WHEN** a member chooses "Paste the key instead"
- **THEN** they can paste the key's text in place of a file

#### Scenario: Ready
- **WHEN** the credentials work
- **THEN** the setup shows as one line with a shortened application ID and
  Replace key, and the existing bank connections appear below it

### Requirement: Credentials are checked
On save and on Check again, the system SHALL check the credentials with Enable
Banking and show the household what to do next. A key that can't be parsed SHALL
NOT be saved. A key that parses SHALL be saved even if the check fails.

#### Scenario: Not a private key
- **WHEN** a member submits something that isn't a private key
- **THEN** nothing is saved and an error says "That isn't a valid private key.
  Upload the .pem file from Enable Banking."

#### Scenario: Key rejected
- **WHEN** Enable Banking refuses the key
- **THEN** Settings says "Enable Banking didn't accept this key. Check that it
  belongs to this app." and offers Replace key

#### Scenario: Redirect URL missing
- **WHEN** the application doesn't list this instance's redirect URL
- **THEN** Settings says "This redirect URL isn't on your app yet. Add it in
  Enable Banking, then check again." with the URL and Check again

#### Scenario: Application not active
- **WHEN** the application isn't active
- **THEN** Settings says "Your app isn't active yet. Link your accounts in Enable
  Banking's Control Panel, then check again." with Check again

#### Scenario: Sandbox application
- **WHEN** the application is a sandbox one
- **THEN** Settings says "This is a sandbox app, so real banks won't work. Create
  a production app." and offers Replace key

#### Scenario: Enable Banking can't be reached
- **WHEN** Enable Banking can't be reached during a check
- **THEN** the credentials are saved and Settings says "Saved, but Enable Banking
  couldn't be reached to check it." with Check again

### Requirement: Replace the key
A member SHALL be able to replace the application ID and key after confirming.
The confirmation SHALL warn that a different application means reconnecting banks.
The old key SHALL stop being used, and cancelling SHALL keep it.

#### Scenario: Confirm replacing
- **WHEN** a member presses Replace key
- **THEN** a confirmation says "Your current key stops being used. If this is a
  different app, you'll need to reconnect your banks."

### Requirement: Bank sync stopping on bad credentials
When Enable Banking stops accepting a household's credentials, Bank connections
SHALL show one warning with Replace key. Connections SHALL NOT be marked as ended,
and no synced transaction SHALL change.

#### Scenario: Key no longer accepted
- **WHEN** a sync is refused because the key is no longer accepted
- **THEN** Settings says "Bank sync stopped because Enable Banking no longer
  accepts your key. Your transactions are safe." once, not on every link, and the
  connections keep their consent dates

### Requirement: Bank data belongs to a household
Connections, links and seen bank lines SHALL belong to a household. The same bank
account SHALL be able to be linked in two households, each receiving its own
transactions. Connecting or reconnecting in one household SHALL NOT affect
another's connections or links.

#### Scenario: A joint account in two households
- **WHEN** two households each link the same joint bank account
- **THEN** a line from the bank is added once to each household's ledger

#### Scenario: Reconnecting a joint account
- **WHEN** one household reconnects a joint account
- **THEN** the other household's connection and link are unchanged

#### Scenario: Switching household during authorization
- **WHEN** a user starts connecting a bank in one household, switches to another,
  and comes back from the bank
- **THEN** no connection is created in the other household, and a message says to
  switch back and connect again

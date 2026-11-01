# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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

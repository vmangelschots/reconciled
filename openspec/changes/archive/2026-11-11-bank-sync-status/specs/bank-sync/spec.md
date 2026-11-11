# Spec Delta

## MODIFIED Requirements

### Requirement: Scheduled and manual sync
The system SHALL sync every household's linked accounts on a schedule, using that
household's own credentials, and when a member presses Sync now in the sync
status. Syncs of one household SHALL never run at the same time, and SHALL NOT
wait for another household's. Settings SHALL show each link's last successful
sync, with its date and time, and how many lines it added.

#### Scenario: Sync now
- **WHEN** the user presses Sync now and 3 new lines are available
- **THEN** the 3 lines are in the ledger and Settings shows the sync time
  and 3 lines added

#### Scenario: Last sync shows the time
- **WHEN** a link last synced on 11 November at 18:32 and added 3 lines
- **THEN** Settings shows "Last sync 11 Nov 18:32, 3 lines added" for it

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

### Requirement: Sync status
Overview, Accounts, Transactions and the Bank connections section in Settings
SHALL show a sync status when the household's credentials work and at least
one bank account is linked. It SHALL show when the household last synced, or
that a sync is running, and SHALL be hidden otherwise.

#### Scenario: After a sync
- **WHEN** the latest successful sync of the household's links was today at
  18:32
- **THEN** the status reads "Synced 18:32"

#### Scenario: An earlier day
- **WHEN** the latest successful sync was yesterday at 18:32, or on 9 November
- **THEN** the status reads "Synced yesterday 18:32", or "Synced 9 Nov 18:32"

#### Scenario: Never synced
- **WHEN** links exist but none has synced yet
- **THEN** the status reads "Not synced yet"

#### Scenario: Nothing linked
- **WHEN** bank sync isn't set up, or no bank account is linked
- **THEN** no sync status is shown on Overview, Accounts or Transactions

### Requirement: Sync status details
Opening the sync status SHALL list each link with its bank, ledger account,
last sync time and lines added, or its last error. It SHALL show when the next
scheduled sync runs, when the instance has a schedule, and offer Sync now.

#### Scenario: Open the status
- **WHEN** the Crelan link to "Joint" synced at 18:32 adding 3 lines, the next sync is at 06:30,
  and the user opens the status
- **THEN** it lists "Crelan → Joint, 18:32, 3 lines", shows "Next sync
  06:30" and offers Sync now

#### Scenario: No schedule
- **WHEN** the instance runs no scheduled sync
- **THEN** the details show no next sync and still offer Sync now

### Requirement: A running sync shows as running
While a sync of the household runs, started by anyone or by the schedule, the
sync status SHALL read "Syncing…" and Sync now SHALL be unavailable. When it
ends, the open page SHALL refresh its data in place and the status SHALL show
the result for a few seconds before showing the last sync time again.

#### Scenario: Press Sync now
- **WHEN** the user presses Sync now and the sync adds 5 lines
- **THEN** the status reads "Syncing…" until it ends, then "Synced just now,
  +5", and the transactions appear on the page without reloading it

#### Scenario: A scheduled sync is running
- **WHEN** the user opens Accounts while the scheduled sync runs
- **THEN** the status reads "Syncing…" and Sync now can't be pressed, and
  when the sync ends the page shows its new lines

#### Scenario: Nothing new
- **WHEN** a sync ends without adding lines
- **THEN** the status reads "Synced just now" without a count

### Requirement: Sync problems show in the status
The sync status SHALL show a warning when a link's last sync failed, when a
connection's consent ended or a link waits for its bank to be reconnected, or
when bank sync stopped because the key is no longer accepted. The details SHALL
say what is wrong for each affected link and offer the way to fix it.

#### Scenario: One bank failing
- **WHEN** Revolut synced at 18:32 and Crelan's last sync failed
- **THEN** the status reads "Synced 18:32 · 1 issue" as a warning, and the
  details show Crelan's error and that the next sync tries again

#### Scenario: Consent ended
- **WHEN** Crelan's consent has ended
- **THEN** the status shows a warning, and the details show "Crelan needs
  reconnecting" with Reconnect, which starts the bank's authorization

#### Scenario: Key no longer accepted
- **WHEN** bank sync stopped because Enable Banking no longer accepts the key
- **THEN** the status reads "Bank sync stopped" as a warning, and the details
  link to Bank connections in Settings

#### Scenario: Sync fails as a whole
- **WHEN** the user presses Sync now and the request fails
- **THEN** an error notification says why, and the status shows the last
  sync time again

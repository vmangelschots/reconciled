# Spec Delta

## MODIFIED Requirements

### Requirement: Consistent operation feedback
The system SHALL report the outcome of a user-initiated action (create,
edit, delete, archive, import, etc.) through a consistent, dismissible
notification, for both success and failure. A bank sync started with Sync
now SHALL show its success in the sync status instead of a notification.

#### Scenario: Successful action shows a confirmation
- **WHEN** a user action completes successfully
- **THEN** a success notification appears and dismisses itself after a
  short delay, without blocking further interaction

#### Scenario: Failed action shows the reason
- **WHEN** a user action fails
- **THEN** an error notification appears stating the reason, and remains
  until the user dismisses it or takes another action

#### Scenario: A sync shows its result in place
- **WHEN** a sync started with Sync now ends and adds 5 lines
- **THEN** no success notification appears, and the sync status shows the
  result

### Requirement: Page header
Every page SHALL start with a header that shows its title, and, where
the page has them, its month switcher, its account picker and its
primary action. On Overview, Accounts and Transactions, the header SHALL
also show the bank sync status when it is shown, beside the primary action.

#### Scenario: Overview header
- **WHEN** the user opens the overview
- **THEN** the header shows "Overview", the month switcher and Import,
  and no account picker

#### Scenario: Header with bank sync
- **WHEN** a household with linked bank accounts opens Accounts
- **THEN** the header shows "Accounts", the sync status and Add account

#### Scenario: Sync status on a phone
- **WHEN** a phone-width screen shows a header with the sync status
- **THEN** the status stays beside the title, showing its icon and time
  without the word "Synced"

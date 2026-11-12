# Spec Delta

## ADDED Requirements

### Requirement: Navigation stays current after a change
After any change the user saves (adding, editing or deleting anything,
committing an import, running a sync), the sidebar's account balances, its
footer total, the account pills and the Review count SHALL show the new
values without the user leaving the page. Saves that finish while these
values are still being reloaded SHALL lead to one more reload, not one per
save, and the values shown SHALL be those after the last save. A failed
save SHALL NOT reload them.

#### Scenario: Edit a transaction's amount
- **WHEN** "Crelan" holds 1,342.00, the user is on Crelan's transactions and
  changes a −20.00 transaction to −50.00
- **THEN** the sidebar shows "Crelan €1,312" and the footer total drops by
  €30, while the user stays on the same page

#### Scenario: Delete a transaction
- **WHEN** the user deletes a −15.00 transaction from "Revolut"
- **THEN** Revolut's balance in the sidebar rises by €15 without navigating

#### Scenario: Commit a file import
- **WHEN** the user commits a CSV import that adds transactions to "Crelan"
  and leaves some guessed categories to review
- **THEN** Crelan's balance in the sidebar and the Review count both update
  while the import result is still on screen

#### Scenario: Confirm categories on Review
- **WHEN** the Review count shows 12 and the user confirms a group of 4
- **THEN** the Review count shows 8

#### Scenario: Account pills on a phone
- **WHEN** the user is on Revolut's transactions at 390px wide and adds a
  −10.00 transaction
- **THEN** the balance at the end of the account pills row drops by €10

#### Scenario: Several saves close together
- **WHEN** three saves finish while the sidebar is still reloading after
  an earlier one
- **THEN** the sidebar reloads once more, not three times, and ends up
  with the values after all three saves

#### Scenario: A save that fails
- **WHEN** saving a transaction fails with an error
- **THEN** the sidebar keeps its values and no extra reload happens

### Requirement: Navigation refreshes when the tab is shown again
When the app's tab becomes visible after being hidden, the sidebar's account
balances, footer total, account pills, Review count and the bank sync status
SHALL be reloaded. This catches changes made by another household member,
in another tab or by a scheduled bank sync. A reload that fails SHALL keep
the values already shown, without an error message.

#### Scenario: Another member edited a transaction
- **WHEN** the user's tab is in the background and another member of the
  household adds a −40.00 transaction to "Crelan", and the user then
  switches back to the tab
- **THEN** the sidebar shows Crelan's new balance without the user
  navigating

#### Scenario: A scheduled sync ran while away
- **WHEN** a scheduled bank sync starts while the tab is hidden and the user
  switches back to it
- **THEN** the sync status shows it running, and when it ends the sidebar
  and the page reload as after any sync

#### Scenario: Offline when returning
- **WHEN** the user switches back to the tab while the server can't be
  reached
- **THEN** the sidebar keeps showing its last values and no error toast
  appears

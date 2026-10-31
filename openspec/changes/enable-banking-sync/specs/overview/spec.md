# Spec Delta

## ADDED Requirements

### Requirement: Bank reconnect reminder
Needs attention SHALL show a line for each bank connection whose consent
ends within 14 days or has ended, naming the bank and saying when. The line
SHALL open the bank connections in Settings.

#### Scenario: Consent ending soon
- **WHEN** Crelan's consent ends in 12 days
- **THEN** needs attention shows "Reconnect Crelan: 12 days left"

#### Scenario: Consent has ended
- **WHEN** Crelan's consent ended 3 days ago
- **THEN** needs attention shows "Reconnect Crelan: sync stopped 3 days
  ago" and no stale-import line for its accounts

#### Scenario: Plenty of time left
- **WHEN** Crelan's consent ends in 60 days
- **THEN** no reconnect line is shown

## MODIFIED Requirements

### Requirement: Needs attention
The overview SHALL list what needs action, each item linking to where
it is fixed, in this order: guesses to review (to Review), uncategorized
transactions with this month's uncategorized spending (to Review),
category warnings (to Budgets on the chosen month), yearly warnings (to
Budgets on the chosen month), missed loan payments (to the loan's
schedule), bank connections to reconnect (to Settings), then a stale
import (to Import, or to Settings for a linked account). When nothing
needs attention, the panel SHALL show one line saying everything is in
order.

#### Scenario: Everything that needs attention
- **WHEN** on 24 October 12 guesses wait for review, 4 transactions are
  uncategorized with 213.00 of uncategorized spending this month,
  "Groceries" spent 412.00 of 350.00, "Restaurants" 180.00 of 200.00,
  "Property tax" of 400.00 is due on 1 November and unpaid, the
  "Mortgage" payment of 2 October was not seen, and "Crelan" was last
  imported on 12 October
- **THEN** the panel lists "12 guesses to review", "4 uncategorized
  (€213 this month)", "Groceries €62 over", "Restaurants at 90%",
  "Property tax due in 8 days", "Mortgage: payment of 2 Oct not seen"
  and "Crelan: last import 12 days ago", in that order

#### Scenario: Category items open the right month
- **WHEN** the user switches to September and selects "Groceries €30
  over"
- **THEN** the Budgets page opens on September

#### Scenario: Nothing to do
- **WHEN** nothing waits for review, nothing is uncategorized, no
  category or yearly budget needs a warning, no loan payment was missed
  and every account was imported in the last 7 days
- **THEN** the panel shows one line saying everything is in order

### Requirement: Stale import reminder
Needs attention SHALL show one stale-import line when any active account
was last imported or synced more than 7 days ago or never. Investment,
property and loan accounts SHALL NOT count, nor SHALL an account whose
connection has ended, which the reconnect line covers. With one such
account the line SHALL name it and say how long ago; with several it
SHALL say how many. The line SHALL open Import on that account, or on the
stalest one, or Settings when that account is linked to a bank.

#### Scenario: A week without an import
- **WHEN** today is 24 October, "Crelan" was last imported on 12 October
  and "Revolut" on 22 October
- **THEN** needs attention shows "Crelan: last import 12 days ago",
  opening Import on Crelan

#### Scenario: A recent import
- **WHEN** every account was last imported 2 days ago
- **THEN** no import item is shown

#### Scenario: Several stale accounts
- **WHEN** "Revolut" was last imported 9 days ago and "Crelan" never
- **THEN** needs attention shows "2 accounts not imported this week",
  opening Import on Crelan

#### Scenario: A house is never stale
- **WHEN** every everyday account was imported 2 days ago and "House"
  (property) was never imported
- **THEN** no import item is shown

#### Scenario: A sync counts as an import
- **WHEN** today is 24 October, "Crelan" was last imported from a file on
  2 October and last synced on 23 October
- **THEN** no import item is shown for "Crelan"

#### Scenario: A sync that stopped working
- **WHEN** today is 24 October, "Crelan" is linked to a bank, and its last
  successful sync was on 12 October
- **THEN** needs attention shows "Crelan: last sync 12 days ago", opening
  Settings

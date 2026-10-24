# Spec Delta

## ADDED Requirements

### Requirement: Overview month
The overview SHALL show one month for every active account together. It
SHALL open on the current month, and a month switcher SHALL move between
months, but not past the current month. With no active account, the page
SHALL point the user to Accounts.

#### Scenario: Opens on this month for all accounts
- **WHEN** the user opens the overview on 24 October 2026 with the active
  accounts "Revolut" and "Crelan"
- **THEN** it shows October 2026 for both accounts, with no account
  picker

#### Scenario: No accounts yet
- **WHEN** there is no active account
- **THEN** the overview says there are no accounts yet and links to
  Accounts

### Requirement: Accounts tile
The overview SHALL show an Accounts tile listing each active account with
its current balance and how long ago it was last imported: "imported
today", "imported N days ago", or "No imports yet". The import line SHALL
use the warning colour when the last import is more than 7 days ago or
there is none. Each row SHALL open that account's transactions.

#### Scenario: Two accounts
- **WHEN** on 24 October "Revolut" has 2,140.00, last imported on 21
  October, and "Crelan" has 1,342.00, last imported on 12 October
- **THEN** the tile lists "Revolut €2,140 · imported 3 days ago" and
  "Crelan €1,342 · imported 12 days ago", the second in the warning
  colour

#### Scenario: A new account
- **WHEN** "Savings" has never been imported
- **THEN** its row says "No imports yet" in the warning colour

#### Scenario: Open an account
- **WHEN** the user selects "Crelan" in the tile
- **THEN** Crelan's transactions open

### Requirement: Overview across all accounts in one request
The system SHALL provide one endpoint that returns every overview figure
for a month across all active accounts:
- the total balance and each account's balance and last import date;
- the month's money in and out;
- the budget totals with outside-budget and uncategorized spending;
- the needs-attention counts and categories;
- the recent transactions.

It SHALL reject a missing or malformed month.

#### Scenario: Malformed month
- **WHEN** the overview is requested with month "2026-13"
- **THEN** the system rejects the request

#### Scenario: Archived accounts are left out
- **WHEN** "Old" is archived and holds 500.00
- **THEN** neither the total balance nor the account list includes it

## MODIFIED Requirements

### Requirement: Balance tile
The overview SHALL show the total current balance of the active
accounts, and their net change in the chosen month: money in minus money
out, without transfers or tabs. The change SHALL name the month ("in
September") when it isn't the current month, where it says "this month".
A positive change SHALL show with "+" in the positive colour. When the
chosen month isn't the current one, the balance SHALL be labelled
"Today".

#### Scenario: Balance and this month's change
- **WHEN** "Revolut" holds 2,140.00 and "Crelan" 1,342.00, and in October
  they received +2,400.00 and spent 1,190.00 outside transfers and tabs
- **THEN** the tile shows €3,482 and "+€1,210 this month"

#### Scenario: A past month
- **WHEN** the user switches to September, when the accounts received
  +2,400.00 and spent 2,100.00
- **THEN** the tile shows the balance labelled "Today" and "+€300 in
  September"

#### Scenario: A transfer between accounts changes nothing
- **WHEN** in October 500.00 moves from "Revolut" to "Crelan" and nothing
  else happens
- **THEN** the total balance and the month's change are unchanged

### Requirement: Needs attention
The overview SHALL list what needs action, each item linking to where
it is fixed, in this order: guesses to review (to Review), uncategorized
transactions with this month's uncategorized spending (to Review),
category warnings (to Budgets on the chosen month), then a stale import
(to Import). When nothing needs attention, the panel SHALL show one line
saying everything is in order.

#### Scenario: Everything that needs attention
- **WHEN** on 24 October 12 guesses wait for review, 4 transactions are
  uncategorized with 213.00 of uncategorized spending this month,
  "Groceries" spent 412.00 of 350.00, "Restaurants" 180.00 of 200.00,
  and "Crelan" was last imported on 12 October
- **THEN** the panel lists "12 guesses to review", "4 uncategorized
  (€213 this month)", "Groceries €62 over", "Restaurants at 90%" and
  "Crelan: last import 12 days ago", in that order

#### Scenario: Category items open the right month
- **WHEN** the user switches to September and selects "Groceries €30
  over"
- **THEN** the Budgets page opens on September

#### Scenario: Nothing to do
- **WHEN** nothing waits for review, nothing is uncategorized, no
  category needs a warning and every account was imported in the last
  7 days
- **THEN** the panel shows one line saying everything is in order

### Requirement: Stale import reminder
Needs attention SHALL show one stale-import line when any active account
was last imported more than 7 days ago or never. With one such account
the line SHALL name it and say how long ago; with several it SHALL say
how many. The line SHALL open Import on that account, or on the stalest
one.

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

### Requirement: Recent transactions
The overview SHALL list the 8 most recent transactions across the active
accounts, as the banks list them (split transactions once), each with
its date, payee, category and amount. With more than one active account,
each row SHALL show its account's name. A transfer between two of the
user's active accounts SHALL be listed once, as "<from> → <to>" with the
amount moved and no sign colour. "View all" SHALL open the last-opened
account's transactions.

#### Scenario: Last eight
- **WHEN** the accounts have 30 transactions between them
- **THEN** the overview lists the 8 most recent, newest first, each with
  its account name, and a "View all" link to Transactions

#### Scenario: A transfer shows once
- **WHEN** the most recent movement is 500.00 from "Revolut" to "Crelan"
- **THEN** one row reads "Revolut → Crelan" with €500.00, and the
  matching +500.00 in Crelan is not listed separately

### Requirement: Overview layout
On wide screens the overview SHALL show balance, budget and accounts as
a row of tiles. Below them, a main column SHALL hold the category chart
and then recent transactions, and a side column SHALL hold needs
attention and then open tabs, so a missing tabs panel leaves no gap.
The 12-month in vs out chart SHALL span the full width at the bottom.

#### Scenario: No tabs, no gap
- **WHEN** no tab exists on a wide screen
- **THEN** the side column holds only needs attention, and the main
  column is unaffected

### Requirement: Overview on a phone
On a phone the overview SHALL be one column in this order: balance,
budget, accounts, needs attention, open tabs, category chart, recent
transactions, in vs out.

#### Scenario: Phone order
- **WHEN** the overview is shown 390px wide
- **THEN** the panels follow the phone order with no sideways scrolling,
  and the last panel isn't hidden behind the tab bar

## REMOVED Requirements

### Requirement: Overview account and month
**Reason**: The overview now covers every active account together; there
is no account to pick or remember.
**Migration**: Replaced by "Overview month". Each account's figures are
in the Accounts tile, and its ledger opens from there.

### Requirement: Forecast tile
**Reason**: The forecast relies on recurring transactions entered by
hand, which this household doesn't do, so the tile would stay empty. The
forecast is being reworked separately.
**Migration**: The Forecast page is unchanged. The tile's place on the
overview goes to the Accounts tile.

### Requirement: Overview in one request
**Reason**: The endpoint no longer answers for a single account.
**Migration**: Replaced by "Overview across all accounts in one
request", which takes only the month.

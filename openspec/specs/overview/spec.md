# Overview Specification

## Purpose
The overview is the app's home page. For one account and one month it
answers "how are we doing?" at a glance: balance, spending against the
budget, what needs attention, where the balance is heading, and recent
activity.

## Requirements

### Requirement: Overview header actions
The overview's header SHALL offer Import, opening the Import page.

#### Scenario: Import from the overview
- **WHEN** the user selects Import in the overview's header
- **THEN** the Import page opens

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

### Requirement: Budget tile
The overview SHALL show spending in categories that have a limit against
the total of those limits, for all active accounts, with a progress bar
and what's left or how much over. Below it, the tile SHALL show any
spending in categories without a limit and any uncategorized spending.
Transfers and tabs SHALL NOT count. With no limits set, the tile SHALL
show the month's spending and link to Budgets to set limits.

#### Scenario: Under budget mid-month (see also Budget pace)
- **WHEN** on 24 October limits total 2,600.00, budgeted categories have
  spent 1,940.00, unbudgeted categories 120.00 and uncategorized 213.00
- **THEN** the tile shows "€1,940 of €2,600", a bar at 75% with a marker
  at 77% of the month, "€660 left · €82 a day", and "+€120 outside
  budgets · €213 uncategorized"

#### Scenario: Over budget
- **WHEN** limits total 2,600.00 and budgeted categories have spent
  2,750.00
- **THEN** the bar is full in the critical colour and the tile says
  "€150 over"

#### Scenario: Unbudgeted spending doesn't make the budget over
- **WHEN** limits total 2,600.00, budgeted categories have spent
  2,000.00 and a car repair without a limit cost 900.00
- **THEN** the tile shows "€600 left" and "+€900 outside budgets"

#### Scenario: No budgets
- **WHEN** no category has a limit
- **THEN** the tile shows the month's spending and links to Budgets to
  set limits

### Requirement: Budget pace
For the current month, the budget tile SHALL show what's left per
remaining day, including today, rounded down to whole euros, and a
marker on the bar at the share of the month passed by the end of today.
Past months SHALL show neither.

#### Scenario: Pace on 24 October
- **WHEN** on 24 October €660 is left of the budget
- **THEN** the tile shows "€82 a day" and a marker at 77% of the bar

#### Scenario: A past month has no pace
- **WHEN** the user switches to September
- **THEN** the tile shows September's budgeted spending against its
  limits without a per-day figure or a month marker

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

### Requirement: Category warnings follow the month's pace
A category SHALL be listed when it is over its limit in the chosen month,
most euros over first. For the current month, a category at 85% of its
limit or more SHALL also be listed when its share is ahead of the share
of the month passed by the end of today, highest share first. Shares
SHALL be rounded down.

#### Scenario: On pace is not a warning
- **WHEN** on 29 October "Restaurants" has spent 180.00 of 200.00
- **THEN** "Restaurants" is not listed, because 90% is behind the 93% of
  the month passed by the end of today

#### Scenario: A past month lists only what went over
- **WHEN** the user switches to September, when "Groceries" spent 380.00
  of 350.00 and "Restaurants" 190.00 of 200.00
- **THEN** the panel lists "Groceries €30 over" and not "Restaurants"

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

### Requirement: Panels load on their own
Each overview panel SHALL show a loading placeholder of its own until its
data arrives, and an error of its own when its data fails to load.

#### Scenario: One panel fails
- **WHEN** the category spending request fails
- **THEN** the category chart says it couldn't load, and every other
  panel still shows

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

# Overview Specification

## Purpose
The overview is the app's home page. For one account and one month it
answers "how are we doing?" at a glance: balance, spending against the
budget, what needs attention, where the balance is heading, and recent
activity.

## Requirements

### Requirement: Overview account and month
The overview SHALL show one account and one month. With nothing
remembered, it SHALL open on the current month and the first active
account. A month switcher SHALL move between months, but not past the
current month. When there is more than one active account, the header
SHALL offer an account picker, and the browser SHALL remember the
choice. With no active account, the page SHALL point the user to
Accounts.

#### Scenario: Opens on this month
- **WHEN** the user opens the overview on 24 October 2026 with no
  account remembered
- **THEN** it shows October 2026 for the first active account

#### Scenario: The chosen account is remembered
- **WHEN** the user picks "Savings" in the overview's account picker and
  later reopens the app
- **THEN** the overview shows "Savings"

#### Scenario: A remembered account that is gone
- **WHEN** the remembered account has since been archived or deleted
- **THEN** the overview shows the first active account

#### Scenario: One account, no picker
- **WHEN** there is only one active account
- **THEN** the header shows no account picker

#### Scenario: No accounts yet
- **WHEN** there is no active account
- **THEN** the overview says there are no accounts yet and links to
  Accounts

### Requirement: Overview header actions
The overview's header SHALL offer Import, opening the Import page.

#### Scenario: Import from the overview
- **WHEN** the user selects Import in the overview's header
- **THEN** the Import page opens

### Requirement: Balance tile
The overview SHALL show the account's current balance, and the account's
net change in the chosen month: its money in minus money out, without
transfers or tabs. The change SHALL name the month ("in September") when
it isn't the current month, where it says "this month". A positive
change SHALL show with "+" in the positive colour. When the chosen month
isn't the current one, the balance SHALL be labelled "Today".

#### Scenario: Balance and this month's change
- **WHEN** the account's balance is 3,482.00, and in October it received
  +2,400.00 and spent 1,190.00 outside transfers and tabs
- **THEN** the tile shows €3,482 and "+€1,210 this month"

#### Scenario: A past month
- **WHEN** the user switches to September, when the account received
  +2,400.00 and spent 2,100.00
- **THEN** the tile shows the balance labelled "Today" and "+€300 in
  September"

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
  and the last import was on 12 October
- **THEN** the panel lists "12 guesses to review", "4 uncategorized
  (€213 this month)", "Groceries €62 over", "Restaurants at 90%" and
  "Last import 12 days ago", in that order

#### Scenario: Category items open the right month
- **WHEN** the user switches to September and selects "Groceries €30
  over"
- **THEN** the Budgets page opens on September

#### Scenario: Nothing to do
- **WHEN** nothing waits for review, nothing is uncategorized, no
  category needs a warning and the last import is 2 days old
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
Needs attention SHALL show how long ago the account's last import was,
when that is more than 7 days ago, or that it has never been imported.

#### Scenario: A week without an import
- **WHEN** today is 24 October and the account's last import was on
  12 October
- **THEN** needs attention shows "Last import 12 days ago"

#### Scenario: A recent import
- **WHEN** the account's last import was 2 days ago
- **THEN** no import item is shown

### Requirement: Forecast tile
The overview SHALL show the lowest projected balance of the account in
the next 90 days from today with its date, in the critical colour below
zero, and the next recurring transaction with its date and amount. When
the chosen month isn't the current one, the tile SHALL be labelled
"From today". With no recurring transactions, the tile SHALL link to
Forecast to add them.

#### Scenario: Low point and next bill
- **WHEN** the forecast's lowest point in 90 days is 410.00 on 28
  November and the next recurring transaction is Rent -950.00 on 1
  November
- **THEN** the tile shows "Low point €410 · 28 Nov" and "Next: Rent
  -€950 · 1 Nov"

#### Scenario: Below zero
- **WHEN** the lowest point is -120.00
- **THEN** it is shown in the critical colour

#### Scenario: Nothing recurring
- **WHEN** the account has no recurring transactions
- **THEN** the tile links to Forecast to add them

### Requirement: Recent transactions
The overview SHALL list the account's 8 most recent transactions, as the
bank lists them (split transactions once), each with its date, payee,
category and amount, and link to Transactions.

#### Scenario: Last eight
- **WHEN** the account has 30 transactions
- **THEN** the overview lists the 8 most recent, newest first, and a
  "View all" link to Transactions

### Requirement: Overview layout
On wide screens the overview SHALL show balance, budget and forecast as
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
budget, forecast, needs attention, open tabs, category chart, recent
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

### Requirement: Overview in one request
The system SHALL provide one endpoint that returns every overview figure
for an account and a month: the account's balance, its money in and out
that month, the budget totals and outside-budget and uncategorized
spending, the needs-attention items, the date of the account's last
import, the forecast low point and the next recurring transaction, and
the recent transactions. It SHALL reject a missing or malformed month
and an unknown account.

#### Scenario: Unknown account
- **WHEN** the overview is requested for an account that doesn't exist
- **THEN** the system responds that the account was not found

#### Scenario: Malformed month
- **WHEN** the overview is requested with month "2026-13"
- **THEN** the system rejects the request

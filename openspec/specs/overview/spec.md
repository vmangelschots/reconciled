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
out, without transfers, tabs or value adjustments. The change SHALL name
the month ("in September") when it isn't the current month, where it
says "this month". A positive change SHALL show with "+" in the positive
colour. When the chosen month isn't the current one, the balance SHALL
be labelled "Today".

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

#### Scenario: A value adjustment is not a change
- **WHEN** in October the only activity is a +15,000.00 value adjustment
  on "House"
- **THEN** the month's change is +€0

### Requirement: Budget tile
The overview SHALL show spending in monthly categories that have a limit
against the total of those limits, for all active accounts, with a
progress bar and what's left or how much over. Below it, the tile SHALL
show any spending in monthly categories without a limit, the month's
spending in yearly and yearly-on-a-date categories, and any
uncategorized spending. Transfers and tabs SHALL NOT count. With no
limits set, the tile SHALL show the month's spending and link to Budgets
to set limits.

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

#### Scenario: Yearly spending has its own line
- **WHEN** limits total 2,600.00, monthly categories have spent 1,940.00,
  "Clothing" (yearly) spent 180.00 and "Property tax" (yearly on a date)
  400.00 this month
- **THEN** the tile shows "€1,940 of €2,600" and, first in the line
  below, "€580 on yearly budgets", and the 580.00 is not counted as
  outside budgets

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
category warnings (to Budgets on the chosen month), yearly warnings (to
Budgets on the chosen month), missed loan payments (to the loan's
schedule), then a stale import (to Import). When nothing needs
attention, the panel SHALL show one line saying everything is in order.

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
was last imported more than 7 days ago or never. Investment, property
and loan accounts SHALL NOT count. With one such account
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

#### Scenario: A house is never stale
- **WHEN** every everyday account was imported 2 days ago and "House"
  (property) was never imported
- **THEN** no import item is shown

### Requirement: Recent transactions
The overview SHALL list the 8 most recent transactions across the active
accounts, as the banks list them (split transactions once), each with
its date, payee, category and amount. Value adjustments SHALL NOT be
listed. With more than one active account,
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

#### Scenario: Value adjustments are left out
- **WHEN** the newest entry is a value adjustment on "House"
- **THEN** it is not listed, and the 8 rows are the most recent other
  transactions

### Requirement: Overview layout
On wide screens the overview SHALL show balance, budget and accounts as
a row of tiles. Below them, a main column SHALL hold the everyday money
chart, the category chart and then recent transactions, and a side column
SHALL hold needs attention, open tabs and then the net worth chart, so a
missing tabs panel leaves no gap.

#### Scenario: No tabs, no gap
- **WHEN** no tab exists on a wide screen
- **THEN** the side column holds needs attention and then net worth, and
  the main column is unaffected

### Requirement: Overview on a phone
On a phone the overview SHALL be one column in this order: balance,
budget, accounts, needs attention, open tabs, everyday money, category
chart, recent transactions, net worth.

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

### Requirement: Yearly warnings
For the chosen month, Needs attention SHALL list yearly budgets that are
over (most euros over first) and targets that are paid over, not seen
yet, overdue or partly paid, as of the month's reference day (see
`yearly-budgets`). For the current month it SHALL also list targets due
soon, and yearly budgets at 85% or more that are ahead of the year's
pace. A target paid within the tolerance SHALL NOT be listed.

#### Scenario: A yearly budget ahead of pace
- **WHEN** on 24 October 2026, with budgeting starting in October,
  "Clothing" has spent 270.00 of its 300.00 for 2026
- **THEN** the panel lists "Clothing at 90% of 2026", because 90% is
  ahead of the 26% of the budgeted year passed

#### Scenario: On pace is not a warning
- **WHEN** "Clothing" has spent 180.00 of 300.00 (60%)
- **THEN** "Clothing" is not listed, because it is below 85%

#### Scenario: Targets that need action
- **WHEN** on 9 November nothing has been spent on "Property tax" (due
  1 November), and "Water tax" (due 1 October, 120.00) was paid 135.00
- **THEN** the panel lists "Property tax overdue" and "Water tax €15
  over"

#### Scenario: Not seen yet is listed
- **WHEN** on 4 November nothing has been spent on "Property tax", due
  on 1 November
- **THEN** the panel lists "Property tax not seen yet"

#### Scenario: Paid within tolerance is not listed
- **WHEN** "Property tax" is 400.00 and 398.12 was spent on it
- **THEN** "Property tax" is not listed

#### Scenario: A past month lists no early warnings
- **WHEN** the user switches to a past month in which "Property tax" was
  due soon and "Clothing" was at 90% but under budget
- **THEN** neither is listed

### Requirement: Valued accounts in the Accounts tile
For an investment, property or loan account, the Accounts tile line
SHALL say when its value was last set ("value set 1 Oct", or "No value
set") instead of when it was last imported, never in the warning colour.

#### Scenario: A valued account
- **WHEN** "House" (property) was last set to a value on 1 October and
  never imported
- **THEN** its row says "value set 1 Oct" in the normal muted colour

### Requirement: Everyday money and net worth
When the active accounts span more than one tier, the Balance tile SHALL
be titled "Everyday" and its large figure SHALL be the Everyday tier's
total; the month change and "Today" label stay as in the Balance tile.
Under a divider it SHALL list each other tier that has
an active account, in tier order, with its total, then "Net worth" with
the total of all active accounts.

#### Scenario: Everyday, savings and a house
- **WHEN** the active accounts are "Revolut" (checking) 1,200.00,
  "Spaarrekening" (savings) 2,282.00 and "House" (property) 295,000.00
- **THEN** the tile is titled "Everyday" and shows €1,200, then lists
  Savings €2,282, Property €295,000 and Net worth €298,482

#### Scenario: A mortgage lowers net worth
- **WHEN** the accounts above also include "Mortgage" (loan) at
  -187,340.00
- **THEN** a Loans line of -€187,340 comes after Property, and Net worth
  is €111,142

#### Scenario: Only everyday accounts
- **WHEN** every active account is checking, cash, credit card or other
- **THEN** the tile is titled "Balance" with no tier lines, as before

#### Scenario: Archived accounts don't count
- **WHEN** the only property account is archived
- **THEN** there is no Property line and its balance is not in net worth

### Requirement: Debt is not shown as an alarm
Loan amounts and a negative net worth SHALL show with a minus sign in
the normal text colour, not in the critical colour.

#### Scenario: The Loans line
- **WHEN** the Loans tier totals -187,340.00
- **THEN** its line reads -€187,340 in the normal text colour

### Requirement: Missed loan payments
Needs attention SHALL list a loan when its latest installment that is
more than 5 days past its date has no matched payment and is not covered
by a balance correction. The line SHALL name the loan and that
installment's date, with the installment number, amount and paying
account beneath, and open the loan's schedule at it. A loan whose latest
such installment is matched or covered SHALL NOT be listed, even if an
earlier one was missed.

#### Scenario: A payment not seen
- **WHEN** today is 12 November and the "Mortgage" installment of 2
  November has no matched payment
- **THEN** needs attention shows "Mortgage: payment of 2 Nov not seen"
  with "Installment 2 of 300 · €944.22 from Crelan" beneath, opening the
  "Mortgage" schedule at that installment

#### Scenario: Still within the window
- **WHEN** today is 5 November and the 2 November installment has no
  matched payment yet
- **THEN** no loan item is shown

#### Scenario: A later payment matched
- **WHEN** the 2 October installment was missed but the 2 November one
  was matched
- **THEN** no loan item is shown

#### Scenario: Covered by a correction
- **WHEN** the 2 November installment has no matched payment, and the
  balance was corrected on 10 November
- **THEN** no loan item is shown

#### Scenario: A loan without a setup
- **WHEN** a loan account has no loan setup
- **THEN** it never shows a missed-payment item

### Requirement: Net worth change in the Balance tile
When the tile lists Net worth, it SHALL show below the figure the chosen
month's change: net worth at that month's end, or today, minus net worth
at the previous month's end, in history's figures. A rise SHALL use "+"
and the positive colour; a fall the secondary colour, never critical. It
SHALL be hidden at zero or without an earlier month end.

#### Scenario: A rise this month
- **WHEN** net worth rose by 1,240.00 since the end of last month
- **THEN** the row shows "+€1,240 this month" under the figure

#### Scenario: A past month
- **WHEN** the user switches to September and net worth fell 300.00 in it
- **THEN** the row shows "-€300 in September" in the secondary colour

#### Scenario: A real jump shows
- **WHEN** a house worth 295,000.00 got its first value this month, with
  no matching loan or payment
- **THEN** the row shows "+€295,000 this month"

#### Scenario: First month
- **WHEN** the history has no earlier month end
- **THEN** no change is shown

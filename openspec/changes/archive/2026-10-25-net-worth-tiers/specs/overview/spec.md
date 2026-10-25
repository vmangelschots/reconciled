# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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

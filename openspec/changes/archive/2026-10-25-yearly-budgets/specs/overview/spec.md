# Spec Delta

## MODIFIED Requirements

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

### Requirement: Needs attention
The overview SHALL list what needs action, each item linking to where
it is fixed, in this order: guesses to review (to Review), uncategorized
transactions with this month's uncategorized spending (to Review),
category warnings (to Budgets on the chosen month), yearly warnings (to
Budgets on the chosen month), then a stale import (to Import). When
nothing needs attention, the panel SHALL show one line saying everything
is in order.

#### Scenario: Everything that needs attention
- **WHEN** on 24 October 12 guesses wait for review, 4 transactions are
  uncategorized with 213.00 of uncategorized spending this month,
  "Groceries" spent 412.00 of 350.00, "Restaurants" 180.00 of 200.00,
  "Property tax" of 400.00 is due on 1 November and unpaid, and "Crelan"
  was last imported on 12 October
- **THEN** the panel lists "12 guesses to review", "4 uncategorized
  (€213 this month)", "Groceries €62 over", "Restaurants at 90%",
  "Property tax due in 8 days" and "Crelan: last import 12 days ago", in
  that order

#### Scenario: Category items open the right month
- **WHEN** the user switches to September and selects "Groceries €30
  over"
- **THEN** the Budgets page opens on September

#### Scenario: Nothing to do
- **WHEN** nothing waits for review, nothing is uncategorized, no
  category or yearly budget needs a warning and every account was
  imported in the last 7 days
- **THEN** the panel shows one line saying everything is in order

## ADDED Requirements

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

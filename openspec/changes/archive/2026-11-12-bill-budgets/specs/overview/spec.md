# Spec Delta

## MODIFIED Requirements

### Requirement: Needs attention
The overview SHALL list what needs action, each item linking to where
it is fixed, in this order: guesses to review (to Review), uncategorized
transactions with this month's uncategorized spending (to Review),
category warnings (to Budgets on the chosen month), yearly warnings (to
Budgets on the chosen month), missed bills (to Budgets on the chosen
month), missed loan payments (to the loan's schedule), bank connections
to reconnect (to Settings), then a stale import (to Import, or to
Settings for a linked account). When nothing needs attention, the panel
SHALL show one line saying everything is in order.

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

#### Scenario: A missed bill after the yearly warnings
- **WHEN** on 28 November "Property tax" is overdue and Spotify, due on
  the 21st, was missed
- **THEN** the panel lists "Property tax overdue" and then "Spotify
  missed"

#### Scenario: Category items open the right month
- **WHEN** the user switches to September and selects "Groceries €30
  over"
- **THEN** the Budgets page opens on September

#### Scenario: Nothing to do
- **WHEN** nothing waits for review, nothing is uncategorized, no
  category, yearly budget or bill needs a warning, no loan payment was
  missed and every account was imported in the last 7 days
- **THEN** the panel shows one line saying everything is in order

### Requirement: Category warnings follow the month's pace
A category SHALL be listed when it is over its limit in the chosen month,
most euros over first. For the current month, a monthly category at 85%
of its limit or more SHALL also be listed when its share is ahead of the
share of the month passed by the end of today, highest share first. A
Bills category SHALL only be listed when it is over. Shares SHALL be
rounded down. A parent's share SHALL include its subcategories, and a
subcategory's cap SHALL be judged on its own.

#### Scenario: On pace is not a warning
- **WHEN** on 29 October "Restaurants" has spent 180.00 of 200.00
- **THEN** "Restaurants" is not listed, because 90% is behind the 93% of
  the month passed by the end of today

#### Scenario: Bills paid early are not ahead
- **WHEN** on 8 November "Streaming" has paid all 40.97 of its bills
- **THEN** "Streaming" is not listed

#### Scenario: A past month lists only what went over
- **WHEN** the user switches to September, when "Groceries" spent 380.00
  of 350.00 and "Restaurants" 190.00 of 200.00
- **THEN** the panel lists "Groceries €30 over" and not "Restaurants"

#### Scenario: A cap goes over inside a parent on budget
- **WHEN** "Food" has spent 780.00 of 1,000.00 and "Restaurant" 130.00 of
  a 100.00 cap
- **THEN** the panel lists "Restaurant €30 over" and not "Food"

#### Scenario: Parent and cap both over
- **WHEN** "Food" has spent 1,050.00 of 1,000.00 and "Restaurant" 130.00
  of a 100.00 cap
- **THEN** the panel lists both, "Food €50 over" first

### Requirement: Budget pace
For the current month, the budget tile SHALL show what's left per
remaining day, including today, rounded down to whole euros, and a
marker on the bar where spending is expected to be by the end of today.
Without bills, the marker SHALL be at the share of the month passed. With
bills, it SHALL be at the bills due by today plus that share of the other
limits, as a share of all limits, and what's left per day SHALL leave out
bills not yet paid. Past months SHALL show neither.

#### Scenario: Pace on 24 October
- **WHEN** on 24 October €660 is left of the budget
- **THEN** the tile shows "€82 a day" and a marker at 77% of the bar

#### Scenario: Pace with bills
- **WHEN** on 10 November (a third of the month passed) limits total
  900.00, of which 300.00 are bills, 200.00 of them due by today, and
  100.00 of the bills is still unpaid while 400.00 is left in all
- **THEN** the marker is at 44% of the bar (200.00 plus a third of
  600.00, of 900.00), and the tile shows "€14 a day" (300.00 over 21
  days)

#### Scenario: A past month has no pace
- **WHEN** the user switches to September
- **THEN** the tile shows September's budgeted spending against its
  limits without a per-day figure or a month marker

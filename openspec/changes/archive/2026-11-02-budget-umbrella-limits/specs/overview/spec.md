## MODIFIED Requirements

### Requirement: Budget tile
The overview SHALL show the month's spending covered by a monthly limit
against the total of those limits, for all active accounts, with a
progress bar and what's left or how much over. The total SHALL count the
limits of categories not covered by a parent's budget, so a subcategory's
cap never adds to it. Below it, the tile SHALL show any spending in monthly
categories with no limit and no parent budget covering them, the month's
spending covered by yearly and yearly-on-a-date budgets, and any
uncategorized spending, each euro in one place only. Transfers and tabs
SHALL NOT count. With no limits set, the tile SHALL show the month's
spending and link to Budgets to set limits.

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

#### Scenario: A cap doesn't add to the total
- **WHEN** "Food" has a limit of 1,000.00 and has spent 780.00 including
  130.00 in "Restaurant", which has a cap of 100.00, and no other category
  has a limit
- **THEN** the tile shows "€780 of €1,000"

#### Scenario: Subcategories without a limit aren't outside budgets
- **WHEN** "Food" has a limit and its subcategory "Takeout", without a
  limit, spent 50.00
- **THEN** the 50.00 counts in the tile's spending and not as outside
  budgets

#### Scenario: Yearly spending under a monthly parent counts once
- **WHEN** "Food" has a limit of 1,000.00, has spent 400.00 in its yearly
  subcategory "Restaurant", and nothing else was spent
- **THEN** the tile shows "€400 of €1,000" and no yearly budgets line

#### Scenario: Subcategory limits count when the parent has no budget
- **WHEN** "Household" has no budget, its subcategories have limits of
  50.00 and 70.00, and no other category has a limit
- **THEN** the tile's total is €120

#### Scenario: No budgets
- **WHEN** no category has a limit
- **THEN** the tile shows the month's spending and links to Budgets to
  set limits

### Requirement: Category warnings follow the month's pace
A category SHALL be listed when it is over its limit in the chosen month,
most euros over first. For the current month, a category at 85% of its
limit or more SHALL also be listed when its share is ahead of the share
of the month passed by the end of today, highest share first. Shares
SHALL be rounded down. A parent's share SHALL include its subcategories,
and a subcategory's cap SHALL be judged on its own.

#### Scenario: On pace is not a warning
- **WHEN** on 29 October "Restaurants" has spent 180.00 of 200.00
- **THEN** "Restaurants" is not listed, because 90% is behind the 93% of
  the month passed by the end of today

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

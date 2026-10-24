# Spec Delta

## MODIFIED Requirements

### Requirement: Monthly money in and money out
For each of the 12 calendar months ending with a chosen month (the
current one when none is chosen), the system SHALL report money in (the sum of positive transaction amounts) and
money out (the sum of negative amounts, as a positive figure). Only
non-archived accounts count, and transfers between the user's accounts
SHALL count toward neither. A month with no transactions SHALL report
zero for both. A split transaction SHALL be counted through its parts, so
a part that is a transfer counts toward neither.

#### Scenario: Income and spending are totalled separately
- **WHEN** an active account has +2,000.00 and -1,500.00 in March, and
  -300.00 more in March on a second active account
- **THEN** March reports money in 2,000.00 and money out 1,800.00

#### Scenario: Archived accounts are excluded
- **WHEN** an archived account has transactions in a month
- **THEN** they count toward neither money in nor money out

#### Scenario: Empty months are zero
- **WHEN** there are no transactions in one of the 12 months
- **THEN** that month is still listed, with zero in and zero out

#### Scenario: Transfers are excluded
- **WHEN** in March -500.00 in "Checking" is a transfer to "Savings"
  (+500.00), and there are no other transactions
- **THEN** March reports zero money in and zero money out

#### Scenario: A split counts once, without its transfer part
- **WHEN** March's only transaction in "Checking" is -60.00, split into
  -30.00 "Restaurants" and -30.00 as a transfer to "Savings"
- **THEN** March reports money out 30.00 and zero money in

### Requirement: In vs out chart
The dashboard SHALL show money in and money out as paired bars, one pair
per month, oldest month on the left, for the 12 months ending with the
overview's chosen month, labelled as covering all active accounts. Money
in SHALL use the positive colour and money out a neutral colour. The two series SHALL be told apart
by a legend as well as by colour. Hovering a bar SHALL show that month's
money in, money out and the difference. A table view SHALL list the same
figures.

#### Scenario: Hover shows the month's figures
- **WHEN** the user hovers over the bars for March
- **THEN** a tooltip shows March's money in, money out and in minus out

#### Scenario: Table view
- **WHEN** the user switches the chart to its table view
- **THEN** a table lists every month with its money in, money out and
  difference

#### Scenario: Follows the overview's month
- **WHEN** the user switches the overview to June 2026
- **THEN** the chart shows July 2025 to June 2026

### Requirement: Expenses per category chart
The dashboard SHALL show the chosen month's category spending as
horizontal bars, largest first, with each bar labelled by its category
name and amount. The month SHALL be the overview's chosen month; the
chart SHALL NOT have a month navigation of its own. A table view SHALL
list the same figures.

#### Scenario: Opens on the current month
- **WHEN** the user opens the overview
- **THEN** the chart shows the current month's spending, largest category
  first

#### Scenario: Move to the previous month
- **WHEN** the user moves the overview's month switcher back one month
- **THEN** the chart shows the previous month's spending

#### Scenario: Empty month
- **WHEN** the chosen month has no spending
- **THEN** the chart says there is no spending for that month instead of
  drawing empty bars

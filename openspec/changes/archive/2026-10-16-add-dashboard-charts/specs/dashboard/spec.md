# Spec Delta

## Purpose

The dashboard is the app's landing page. It gives an at-a-glance view of
cash flow and spending across the user's active accounts.

## ADDED Requirements

### Requirement: Monthly money in and money out
For each of the last 12 calendar months, ending with the current one, the
system SHALL report money in (the sum of positive transaction amounts) and
money out (the sum of negative amounts, as a positive figure). Only
non-archived accounts count. A month with no transactions SHALL report
zero for both.

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

### Requirement: In vs out chart
The dashboard SHALL show money in and money out as paired bars, one pair
per month, oldest month on the left. The two series SHALL be told apart
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

### Requirement: Category spending for a month
For a chosen month, the system SHALL report each category's spending:
the net outflow of its transactions in active accounts, so refunds reduce
it. A top-level category's figure SHALL include its subcategories. A
category with no net outflow SHALL be left out. Spending without a
category SHALL be reported as "Uncategorized", counting outflows only.

#### Scenario: Subcategories roll into their parent
- **WHEN** in March "Groceries" has -50.00 directly and its subcategory
  "Supermarket" has -200.00
- **THEN** "Groceries" reports 250.00, of which "Supermarket" is 200.00

#### Scenario: Refunds reduce spending
- **WHEN** in March "Clothing" has -80.00 and a refund of +30.00
- **THEN** "Clothing" reports 50.00

#### Scenario: Uncategorized ignores income
- **WHEN** in March uncategorized transactions are -40.00 and a salary of
  +2,000.00
- **THEN** "Uncategorized" reports 40.00

### Requirement: Expenses per category chart
The dashboard SHALL show the chosen month's category spending as
horizontal bars, largest first, with each bar labelled by its category
name and amount. It SHALL open on the current month and offer previous-
and next-month navigation, with no navigating past the current month.
A table view SHALL list the same figures.

#### Scenario: Opens on the current month
- **WHEN** the user opens the dashboard
- **THEN** the chart shows the current month's spending, largest category
  first

#### Scenario: Move to the previous month
- **WHEN** the user presses "previous month"
- **THEN** the chart shows the previous month's spending, and "next month"
  becomes available

#### Scenario: Empty month
- **WHEN** the chosen month has no spending
- **THEN** the chart says there is no spending for that month instead of
  drawing empty bars

### Requirement: Expand a category into its subcategories
A top-level category with subcategories SHALL be expandable in the
expenses chart. Expanding it SHALL show one bar per subcategory with
spending, largest first, plus a bar for spending booked directly on the
parent if there is any. Collapsing it SHALL restore the single bar.

#### Scenario: Expand a parent
- **WHEN** the user expands "Groceries" (250.00, of which "Supermarket" is
  200.00)
- **THEN** below "Groceries" the chart shows "Supermarket" 200.00 and
  "Groceries (direct)" 50.00

#### Scenario: Categories without subcategories are not expandable
- **WHEN** a category has no subcategory with spending that month
- **THEN** its bar offers no expand control

### Requirement: Dashboard loading and errors
While its data loads for the first time, each chart SHALL show a loading
state in its own area. When a load fails, the chart SHALL say it couldn't
load, and an error notification SHALL be shown, without affecting the
other chart.

#### Scenario: One chart fails, the other still shows
- **WHEN** the category spending request fails but the in/out request
  succeeds
- **THEN** the in vs out chart is shown, and the expenses chart shows an
  error message

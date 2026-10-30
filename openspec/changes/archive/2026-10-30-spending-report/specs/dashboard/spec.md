# Spec Delta

## ADDED Requirements

### Requirement: Money in and out per report month
For each month of the report's period, the system SHALL report money in
(the sum of positive amounts) and money out (the sum of negative amounts,
as a positive figure). Every account counts, archived ones included;
transfers between the user's accounts and value adjustments count toward
neither. An empty month reports zero for both. A split transaction counts
through its parts, so a part that is a transfer counts toward neither.

#### Scenario: Income and spending are totalled separately
- **WHEN** an account has +2,000.00 and -1,500.00 in March, and -300.00
  more in March on a second account
- **THEN** March reports money in 2,000.00 and money out 1,800.00

#### Scenario: Archived accounts count
- **WHEN** an archived account has -40.00 in March and there are no other
  transactions
- **THEN** March reports money out 40.00

#### Scenario: Empty months are zero
- **WHEN** there are no transactions in one of the period's months
- **THEN** that month is still listed, with zero in and zero out

#### Scenario: Transfers are excluded
- **WHEN** in March -500.00 in "Checking" is a transfer to "Savings"
  (+500.00), and there are no other transactions
- **THEN** March reports zero money in and zero money out

#### Scenario: A split counts once, without its transfer part
- **WHEN** March's only transaction in "Checking" is -60.00, split into
  -30.00 "Restaurants" and -30.00 as a transfer to "Savings"
- **THEN** March reports money out 30.00 and zero money in

#### Scenario: Value adjustments are excluded
- **WHEN** March's only entry is a -8,000.00 value adjustment on "Funds"
- **THEN** March reports zero money in and zero money out

### Requirement: In vs out on Reports
The Reports page SHALL offer an In vs out view beside its spending chart,
showing money in and money out as paired bars, one pair per month, oldest
month on the left, for the report's period. Money in SHALL use the
positive colour and money out a neutral colour. The two series SHALL be
told apart by a legend as well as by colour. Hovering a bar SHALL show
that month's money in, money out and the difference. A table view SHALL
list the same figures.

#### Scenario: Hover shows the month's figures
- **WHEN** the user hovers over the bars for March
- **THEN** a tooltip shows March's money in, money out and in minus out

#### Scenario: Table view
- **WHEN** the user switches the chart to its table view
- **THEN** a table lists every month with its money in, money out and
  difference

#### Scenario: Follows the report's period
- **WHEN** the user switches the report to Last year
- **THEN** the chart shows January to December of last year

## MODIFIED Requirements

### Requirement: Dashboard loading and errors
While its data loads for the first time, the expenses chart SHALL show a
loading state in its own area. When a load fails, the chart SHALL say it
couldn't load, and an error notification SHALL be shown, without affecting
the rest of the overview.

#### Scenario: One chart fails, the other still shows
- **WHEN** the category spending request fails but the overview request
  succeeds
- **THEN** the tiles are shown, and the expenses chart shows an error
  message

### Requirement: Tab rows are neither income nor spending
Transactions and split parts in a tab SHALL count toward neither money
in, money out nor category spending, the same way transfers don't. The
Reports page SHALL say "Excludes transfers and tabs".

#### Scenario: Half a dinner to a tab
- **WHEN** March's only transaction is -60.00, split into -30.00
  "Restaurants" and -30.00 "Tabs / Jan"
- **THEN** March reports money out 30.00 and "Restaurants" 30.00, and
  "Tabs" is not listed in category spending

#### Scenario: A repayment is not income
- **WHEN** in March +30.00 from "JAN PEETERS" is categorized "Tabs / Jan"
  and there are no other transactions
- **THEN** March reports zero money in

#### Scenario: The chart says what it leaves out
- **WHEN** the user opens Reports
- **THEN** the page shows "Excludes transfers and tabs"

## REMOVED Requirements

### Requirement: Monthly money in and money out
**Reason**: It covered 12 months ending at the Overview's month, for
active accounts. The figures now follow the report's period and count
archived accounts.
**Migration**: See "Money in and out per report month".

### Requirement: In vs out chart
**Reason**: The chart moves from the Overview to the Reports page.
**Migration**: See "In vs out on Reports".

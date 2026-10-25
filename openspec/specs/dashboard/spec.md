# Dashboard Specification

## Purpose

The dashboard is the app's landing page. It gives an at-a-glance view of
cash flow and spending across the user's active accounts.

## Requirements

### Requirement: Monthly money in and money out
For each of the 12 calendar months ending with a chosen month (by
default the current one), the system SHALL report money in (the sum of
positive amounts) and money out (the sum of negative amounts, as a
positive figure). Only non-archived accounts count; transfers between
the user's accounts count toward neither. An empty month reports zero
for both. A split transaction counts through its parts, so a part that
is a transfer counts toward neither.

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

### Requirement: Category spending for a month
For a chosen month, the system SHALL report each category's spending:
the net outflow of its transactions in active accounts, so refunds reduce
it. A top-level category's figure SHALL include its subcategories. A
category with no net outflow SHALL be left out. Spending without a
category SHALL be reported as "Uncategorized", counting outflows only and
leaving out transfers between the user's accounts. A split transaction
SHALL be counted through its parts, never as "Uncategorized" itself.

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

#### Scenario: Uncategorized ignores transfers
- **WHEN** in March there is -40.00 uncategorized spending and a -500.00
  transfer to "Savings"
- **THEN** "Uncategorized" reports 40.00

#### Scenario: Split parts count toward their categories
- **WHEN** in March a -60.00 transaction is split into -40.00 "Groceries"
  and -20.00 "Household"
- **THEN** "Groceries" reports 40.00, "Household" reports 20.00, and
  nothing is reported as "Uncategorized"

### Requirement: Expenses per category chart
The dashboard SHALL show the chosen month's category spending as
horizontal bars, largest first, with each bar labelled by its category
name and amount, or as a donut when the user picks the pie view. The
month SHALL be the overview's chosen month; the chart SHALL NOT have a
month navigation of its own. A table view SHALL list the same figures.

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
  drawing empty bars or an empty donut

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

### Requirement: Tab rows are neither income nor spending
Transactions and split parts in a tab SHALL count toward neither money
in, money out nor category spending, the same way transfers don't. The
in vs out chart SHALL say "Excludes transfers and tabs".

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
- **WHEN** the user opens the dashboard
- **THEN** the in vs out chart shows "Excludes transfers and tabs"

### Requirement: Bars or pie view
The expenses chart SHALL offer a switch between the bars view and the pie
view, beside the table toggle. Bars SHALL be the default. The choice
SHALL be remembered in the browser across visits and months. The table
toggle SHALL work the same under either view.

#### Scenario: Switch to the pie
- **WHEN** the user picks the pie view
- **THEN** the chart shows the month's spending as a donut

#### Scenario: The choice is remembered
- **WHEN** the user picks the pie view, leaves the overview and opens it
  again
- **THEN** the chart opens in the pie view

#### Scenario: First visit
- **WHEN** the user has never picked a view in this browser
- **THEN** the chart shows bars

#### Scenario: Table under the pie
- **WHEN** the pie view is shown and the user selects "Show as table"
- **THEN** the same table as under the bars view appears

### Requirement: Pie view slices and legend
The donut SHALL show the six largest categories as their own slices,
coloured by rank. Two or more smaller categories SHALL be combined into
one "Other" slice; a single one keeps its own slice. "Uncategorized"
SHALL always have its own slice. A legend SHALL list each slice with its
name, amount and share of the month's spending.

#### Scenario: Tail grouped into Other
- **WHEN** a month has spending in nine categories and some uncategorized
  spending
- **THEN** the donut shows the six largest categories, one "Other" slice
  holding the remaining three, and an "Uncategorized" slice

#### Scenario: Exactly seven categories
- **WHEN** a month has spending in exactly seven categories
- **THEN** all seven get their own slice and there is no "Other"

#### Scenario: Legend shows shares
- **WHEN** "Groceries" spent 250.00 of a month's 1,000.00 total
- **THEN** its legend row shows "Groceries", "€250.00" and "25%"

### Requirement: Pie view total and highlight
The centre of the donut SHALL show the total being shown. Hovering or
selecting a slice or its legend row SHALL highlight that slice and show
its name, amount and share in the centre instead.

#### Scenario: Centre total
- **WHEN** the pie view shows a month with 1,000.00 of spending
- **THEN** the centre of the donut shows "€1,000.00"

#### Scenario: Hover a slice
- **WHEN** the user hovers the "Groceries" slice
- **THEN** that slice is highlighted and the centre shows "Groceries",
  "€250.00" and "25%"

### Requirement: Drill into a pie slice
In the pie view, a parent category with subcategories and the "Other"
slice SHALL be drillable. Drilling in SHALL show a donut of its parts:
the subcategories plus "<Parent> (direct)" for spending booked on the
parent itself, or the categories grouped into "Other". A back control
SHALL return to all categories. Changing the month SHALL return to all
categories.

#### Scenario: Drill into a parent
- **WHEN** the user selects "Groceries" (250.00, of which "Supermarket"
  is 200.00) in the pie view
- **THEN** the donut shows "Supermarket" 200.00 and "Groceries (direct)"
  50.00, the centre shows "Groceries" and "€250.00", and "← All
  categories" is offered

#### Scenario: Back to all categories
- **WHEN** the user has drilled into "Groceries" and selects "← All
  categories"
- **THEN** the donut shows all categories again

#### Scenario: Drill into Other
- **WHEN** the user selects the "Other" slice
- **THEN** the donut shows the categories grouped into "Other", each with
  its amount

#### Scenario: Categories without subcategories are not drillable
- **WHEN** a category has no subcategory with spending that month
- **THEN** selecting its slice or legend row does not drill in

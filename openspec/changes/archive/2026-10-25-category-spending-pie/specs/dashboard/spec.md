# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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

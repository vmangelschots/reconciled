# Spec Delta

## Purpose

The Budgets page's overview answers whether the month is going well, what
needs attention, and where each budget stands, for every kind of budget.

## ADDED Requirements

### Requirement: Budget headline
The Budgets page SHALL open with a headline showing the viewed month's
budgeted spending against its limits with a progress bar, what's left or how
much over, and a line with the month's other spending. Its figures SHALL equal
the Overview's budget tile for that month. No year total SHALL be shown.

#### Scenario: Same figures as the Overview
- **WHEN** on 24 October limits total 910.00, budgeted categories have spent
  785.00, yearly budgets 130.00, categories without a budget 35.00 and
  uncategorized 42.00
- **THEN** the headline shows "€785 of €910", "€125 left · €17 a day", and
  "€130 on yearly budgets · +€35 outside budgets · €42 uncategorized"

#### Scenario: No limits yet
- **WHEN** no category has a limit
- **THEN** the headline shows the month's spending without a bar, and says
  to click a category to set a budget

### Requirement: Headline verdict
The headline SHALL state a verdict. For the current month it SHALL say "On
track", or how many items need a look. For a past month it SHALL say how far
under or over the month finished. A future month SHALL have no verdict.

#### Scenario: Items need a look
- **WHEN** the current month has two items in Needs a look
- **THEN** the headline says "2 need a look"

#### Scenario: Nothing needs a look
- **WHEN** the current month has no items in Needs a look
- **THEN** the headline says "On track"

#### Scenario: A finished month
- **WHEN** the user views a past month that ended 150.00 over its limits
- **THEN** the headline says "Finished €150 over", without a per-day figure
  or a month marker

#### Scenario: A future month
- **WHEN** the user views next month
- **THEN** the headline shows the limits without a verdict

### Requirement: Needs a look
The page SHALL list the monthly and yearly warnings of the Overview's Needs
attention panel for the viewed month, with the same rules, order and wording,
and SHALL leave the section out when there are none. Clicking an item SHALL
open that budget's sheet. Rows in the list SHALL keep their place.

#### Scenario: Over and due soon
- **WHEN** on 24 October "Transport" is 20.00 over and "Property tax" is due
  on 1 November
- **THEN** Needs a look lists both, and both also stay in their place in the
  list

#### Scenario: Nothing to show
- **WHEN** nothing needs a look
- **THEN** the section isn't shown

### Requirement: One list of budgets
The page SHALL list monthly, yearly and yearly-on-a-date budgets in one list
in category order, with subcategories under their parent whatever their kind.
A subcategory whose parent isn't listed SHALL read "Parent / Sub". Tab groups
and tabs SHALL NOT be listed.

#### Scenario: Mixed kinds under one parent
- **WHEN** "Car" has the monthly subcategory "Fuel", the yearly "Repairs" and
  the on-a-date "Insurance"
- **THEN** all three are listed under "Car"

#### Scenario: Rows don't move with spending
- **WHEN** "Groceries" goes over its limit
- **THEN** it stays in its place in the list

#### Scenario: Changing kind doesn't move a row
- **WHEN** the user switches "Clothing" from monthly to yearly
- **THEN** it stays in its place in the list

#### Scenario: Yearly categories outside the budgeted period
- **WHEN** the start month is October 2026 and the user views September 2026
- **THEN** monthly budgets are listed, and a note says budgeting by year
  starts in October 2026 and offers to go there, instead of the yearly budgets

### Requirement: Budget rows
A row with a budget SHALL show its name, a progress bar, what's left or how
much over, and a caption with spent and budget and the period in words. A
monthly budget's figures SHALL be for the viewed month, and yearly ones for
the year through the viewed month.

#### Scenario: Category within limit
- **WHEN** "Groceries" has a 400.00 limit and spent 320.00
- **THEN** its row shows "€80 left" and "€320 of €400 a month"

#### Scenario: Category over limit
- **WHEN** "Groceries" has a 400.00 limit and spent 430.00
- **THEN** its row shows "€30 over" in the critical colour, with a full
  critical bar

#### Scenario: A yearly budget
- **WHEN** on 24 October 2026 "Clothing" has spent 720.00 of 1,200.00
- **THEN** its row shows "€480 left" and "€720 of €1,200 a year · €160 a month
  to Dec"

#### Scenario: A pro-rated budget
- **WHEN** "Clothing" has 300.00 for 2026, from a full 1,200.00
- **THEN** its caption also shows "of €1,200 · from Oct"

#### Scenario: A target
- **WHEN** "Property tax" is 400.00 due on 1 November, and nothing is spent
- **THEN** its row shows "€400 to pay" and "€0 of €400 · due 1 Nov, in 8 days"

#### Scenario: A paid target within tolerance
- **WHEN** "Property tax" is 400.00 and 405.00 was spent on it
- **THEN** its row shows paid, with a full bar in the positive colour

### Requirement: As-of date for yearly figures
When any yearly budget is listed, the page SHALL say up to which day yearly
figures count.

#### Scenario: Viewing October
- **WHEN** the user views October on 24 October
- **THEN** the page says yearly figures count to 24 Oct

#### Scenario: Viewing an earlier month
- **WHEN** "Clothing" spent 180.00 in October and 90.00 in November, and the
  user views October
- **THEN** the page says to 31 Oct, and "Clothing" counts 180.00

### Requirement: Pace on rows
For the current month, each monthly and yearly bar SHALL show a pace marker. A
budget listed in Needs a look for being ahead of pace SHALL be shown in the
warning colour. Other months SHALL show neither.

#### Scenario: Monthly warning agrees with the Overview
- **WHEN** on 24 October "Utilities" has spent 90% of its limit
- **THEN** its bar is amber, and it is listed in Needs a look

#### Scenario: A past month has no pace
- **WHEN** the user views September
- **THEN** no bar has a pace marker

### Requirement: Month overrides are marked
A monthly budget with an override for the viewed month SHALL say so in its
caption.

#### Scenario: A December override
- **WHEN** "Groceries" has an override of 600.00 for December, and the user
  views December
- **THEN** its caption says "this month only"

### Requirement: Rows without their own budget
A subcategory without a budget under a parent with one SHALL show what it
spent in the month and that its parent covers it, without a bar. A parent
without a budget SHALL show the total spent under it in the month, without a
bar. Neither SHALL show a limit made up from other figures.

#### Scenario: A covered subcategory
- **WHEN** "Food" has a limit and "Takeout" has none and spent 50.00
- **THEN** "Takeout" shows "€50 spent" and "Covered by Food"

#### Scenario: A parent that is only a group
- **WHEN** "Household" has no budget and spent 10.00 directly, and its
  subcategory "Cleaning" spent 30.00 of a 50.00 limit
- **THEN** "Household" shows "€40 spent" without a bar, and "Cleaning" shows
  its own bar

### Requirement: Categories without a budget collapse
Top-level categories with no budget, and no subcategory with one, SHALL be
collapsed into one "No budget" row with their count and total spending, which
expands to list them.

#### Scenario: Two without a budget
- **WHEN** "Gifts" spent 35.00 and "Pets" spent nothing, and neither has a
  budget
- **THEN** the list shows "No budget (2)" with "€35 spent", and expanding it
  lists both

### Requirement: Uncategorized in the list
The list SHALL end with the month's uncategorized spending, linking to Review.
Transfers, value adjustments, tabs and split transactions themselves SHALL NOT
count, as in the budgets capability.

#### Scenario: Uncategorized spending
- **WHEN** the month has 42.00 in uncategorized spending
- **THEN** the list ends with "Uncategorized", "€42 spent" and a link to Review

### Requirement: Budget sheet
Clicking a budget, No budget or subcategory row SHALL open a sheet with that
category's figures, its budget editor and the viewed month's transactions. It
SHALL open from the side, or from the bottom on a phone. Saving SHALL close it
and briefly highlight the row.

#### Scenario: Set a limit from the sheet
- **WHEN** the user clicks "Groceries", changes its amount and saves
- **THEN** the sheet closes, a toast confirms it, and the row shows the new
  limit and is highlighted

#### Scenario: A parent's transactions
- **WHEN** the user opens "Food", which covers its subcategories
- **THEN** the sheet lists the month's transactions in "Food" and its
  subcategories

#### Scenario: Fix a category from the sheet
- **WHEN** the user changes a transaction's category in the sheet
- **THEN** the sheet's rows and the page's figures refresh

#### Scenario: A yearly budget shows the viewed month
- **WHEN** the user opens "Clothing" (yearly)
- **THEN** the sheet shows its figures for the year, and transactions for the
  viewed month only, saying which month

#### Scenario: Rename from the sheet
- **WHEN** the user wants to rename the category
- **THEN** the sheet links to the category settings

### Requirement: Budgets on a phone
On a phone, the headline and Needs a look SHALL be one block above the list,
and each row SHALL stack its name and figure, bar, and caption, with the whole
row clickable.

#### Scenario: A phone-width screen
- **WHEN** the user opens Budgets at 390px wide
- **THEN** no row scrolls sideways, and clicking a row opens the sheet from
  the bottom

### Requirement: No categories yet
With no categories, the Budgets page SHALL link to the category settings to
add one.

#### Scenario: First visit
- **WHEN** a new household opens Budgets
- **THEN** it says there are no categories yet and links to /categories

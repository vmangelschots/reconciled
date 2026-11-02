## ADDED Requirements

### Requirement: A parent's budget covers its subcategories
A top-level category's budget SHALL cover its own spending plus that of all
its subcategories, whatever their budget kind. A parent without a budget
SHALL be a plain group: its subcategories' budgets stand on their own.

#### Scenario: Subcategories count against the parent
- **WHEN** "Food" has a limit of 1,000.00 and this month spent 50.00
  directly, 480.00 in "Groceries" and 250.00 in "Restaurant"
- **THEN** "Food" shows 780.00 spent and 220.00 remaining

#### Scenario: A yearly subcategory counts the same
- **WHEN** "Food" has a limit of 1,000.00 and its yearly subcategory
  "Restaurant" spent 400.00 this month
- **THEN** the 400.00 counts in "Food"'s spending for the month, and also
  against "Restaurant"'s yearly budget

#### Scenario: A parent without a budget is a group
- **WHEN** "Household" has no budget and its subcategory "Cleaning" has a
  limit of 50.00
- **THEN** "Cleaning" is compared to its own limit, and "Household" has no
  limit made up from it

### Requirement: A subcategory's limit is a cap inside its parent
A budget on a subcategory of a parent with a budget SHALL be a cap: it keeps
its own figures and warnings and SHALL NOT affect whether the parent is over.
A subcategory's caps MAY add up to more than the parent's limit, and the
monthly summary SHALL note it when they do.

#### Scenario: Over the cap, within the parent
- **WHEN** "Food" has spent 780.00 of 1,000.00 and its subcategory
  "Restaurant" 130.00 of a 100.00 cap
- **THEN** "Restaurant" shows 30.00 over and is flagged, and "Food" shows
  220.00 remaining and is not flagged

#### Scenario: Caps may exceed the parent
- **WHEN** "Food" has a limit of 400.00 and its subcategories have caps of
  300.00 and 150.00
- **THEN** the limits are accepted, and the summary notes that the caps add
  up to 450.00, more than "Food"'s 400.00

## MODIFIED Requirements

### Requirement: Create and edit category
The system SHALL allow the user to create a spending category with a
name, optionally nested under a parent category, and to rename or
re-parent it later. A category SHALL NOT be nested more than two levels
deep - a category that already has a parent cannot itself be set as a
parent for another category.

#### Scenario: Create a category
- **WHEN** the user creates a category named "Groceries"
- **THEN** the category is available to assign to transactions and to
  set a monthly limit on

#### Scenario: Category names are unique
- **WHEN** the user attempts to create a top-level category with a name
  that already exists among top-level categories, or a subcategory with
  a name that already exists under the same parent
- **THEN** the system rejects the request

#### Scenario: A subcategory name may repeat under a different parent
- **WHEN** the user creates a subcategory named "Other" under
  "Groceries", and a different subcategory also named "Other" under
  "Transport"
- **THEN** the system allows both, since they have different parents

#### Scenario: Create a subcategory
- **WHEN** the user creates a category named "Supermarket" with
  "Groceries" as its parent
- **THEN** "Supermarket" is available to assign to transactions and to
  set its own monthly limit on, as a cap inside "Groceries"'s budget

#### Scenario: Reject nesting a subcategory under a subcategory
- **WHEN** the user attempts to set "Supermarket" (itself a subcategory
  of "Groceries") as the parent of another category
- **THEN** the system rejects the request

### Requirement: View budget period summary
The system SHALL show, for a given month, each monthly category's limit,
its spending in that month, the remaining amount, and whether it is over
its limit. Yearly and yearly-on-a-date categories SHALL NOT be listed in
the monthly summary. Subcategories SHALL be grouped under their parent for
display, including when the parent is not listed itself. A parent with a
limit SHALL show that its figures include its subcategories, and a
subcategory without a limit under a parent with a budget SHALL show that
it is covered by the parent.

#### Scenario: Category within limit
- **WHEN** "Groceries" has a 400.00 limit for the current month and
  320.00 in assigned transactions
- **THEN** the summary shows 320.00 spent, 80.00 remaining, and not over
  limit

#### Scenario: Category over limit
- **WHEN** "Groceries" has a 400.00 limit for the current month and
  430.00 in assigned transactions
- **THEN** the summary shows 430.00 spent, -30.00 remaining, and flags
  the category as over limit

#### Scenario: Subcategories are grouped under their parent, not summed into it
- **WHEN** "Groceries" has no budget and 320.00 in transactions assigned
  directly to it, and its subcategory "Supermarket" has 90.00 in
  transactions assigned to "Supermarket" specifically
- **THEN** the summary shows "Supermarket" grouped under "Groceries",
  "Groceries" shows 320.00 spent (not 410.00), and "Supermarket" shows
  90.00 spent against its own limit

#### Scenario: Subcategories are included in a parent with a limit
- **WHEN** "Groceries" has a 500.00 limit and 320.00 in transactions
  assigned directly to it, and its subcategory "Supermarket" has 90.00 in
  transactions assigned to "Supermarket" specifically
- **THEN** the summary shows "Supermarket" grouped under "Groceries",
  "Groceries" shows 410.00 spent and says it includes its subcategories,
  and "Supermarket" shows 90.00 spent

#### Scenario: A subcategory without a limit is covered by its parent
- **WHEN** "Food" has a limit and its subcategory "Takeout" has none
- **THEN** "Takeout" shows its spending and that it is covered by "Food",
  not that it has no limit

#### Scenario: A monthly subcategory of a yearly parent is listed
- **WHEN** "Holidays" is yearly and its subcategory "Parking" is monthly
- **THEN** the monthly summary lists "Parking", and doesn't list "Holidays"

#### Scenario: Yearly categories are not in the monthly summary
- **WHEN** "Clothing" is yearly and spent 180.00 this month
- **THEN** the monthly summary doesn't list "Clothing", and its 180.00
  is not uncategorized spend

### Requirement: Yearly spending in the monthly summary
The monthly summary SHALL end with a line showing the month's spending
covered by a yearly or yearly-on-a-date budget, pointing to the "This year"
section, so the month's spending stays complete. Spending covered by a
parent with a monthly limit SHALL NOT be on this line, since it already
counts in that parent. Spending under a yearly or yearly-on-a-date parent
SHALL be on this line, whatever the subcategory's kind.

#### Scenario: Yearly spending line
- **WHEN** "Clothing" (yearly) spent 180.00 and "Property tax" (yearly
  on a date) 400.00 this month
- **THEN** the monthly summary ends with "Yearly budgets 580.00 this
  month"

#### Scenario: Under a monthly parent it isn't counted twice
- **WHEN** "Food" has a monthly limit and its yearly subcategory
  "Restaurant" spent 400.00 this month, and no other yearly budget spent
  anything
- **THEN** the monthly summary has no yearly spending line, and "Food"'s
  spending includes the 400.00

#### Scenario: Under a yearly parent it follows the parent
- **WHEN** "Holidays" is yearly and its monthly subcategory "Parking"
  spent 40.00 this month
- **THEN** the yearly spending line includes the 40.00

# Budgets Specification

## Purpose

Budgets let the user define spending categories and a monthly limit for
each, and see how actual spending in a given month compares to that
limit.

## Requirements

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

### Requirement: Delete category requires reassignment
The system SHALL block deleting a category that has one or more
transactions assigned to it until the user reassigns those transactions
to another category or to uncategorized. The system SHALL also block
deleting a category that still has subcategories, until they are deleted
or re-parented.

#### Scenario: Attempt to delete a category in use
- **WHEN** the user attempts to delete "Groceries" while transactions are
  still assigned to it
- **THEN** the system rejects the deletion and indicates how many
  transactions are affected

#### Scenario: Delete after reassignment
- **WHEN** the user reassigns all of "Groceries"'s transactions to
  another category and then deletes "Groceries"
- **THEN** the category is deleted and no transaction references it

#### Scenario: Attempt to delete a category that still has subcategories
- **WHEN** the user attempts to delete "Groceries" while "Supermarket"
  is still nested under it
- **THEN** the system rejects the deletion and indicates that
  subcategories must be removed or re-parented first

### Requirement: Set monthly limit per category
The system SHALL allow the user to set a default monthly spending limit
for a monthly category, and to override that limit for a specific month.
The system SHALL reject a monthly limit on a yearly or yearly-on-a-date
category.

#### Scenario: Set a default limit
- **WHEN** the user sets a default monthly limit of 400.00 for
  "Groceries"
- **THEN** every month without its own override uses 400.00 as the limit

#### Scenario: Override a single month
- **WHEN** the user sets a limit of 600.00 for "Groceries" for December
  only
- **THEN** December uses 600.00 as the limit and all other months
  continue to use the default

#### Scenario: No monthly limit on a yearly category
- **WHEN** the user tries to set a monthly limit on "Clothing", which is
  yearly
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

### Requirement: Uncategorized transactions excluded from budgets
The system SHALL exclude uncategorized transactions from every category's
spend total, and SHALL report the total amount of uncategorized
transactions for the month separately. Transfers between the user's
accounts and value adjustments SHALL NOT count as uncategorized spend. A
split transaction SHALL NOT count as uncategorized spend; its parts
SHALL count toward their own categories, or as uncategorized spend when
they have none.

#### Scenario: Uncategorized spend is shown separately
- **WHEN** a month has 50.00 in uncategorized transactions
- **THEN** the budget summary for that month shows 50.00 as
  uncategorized spend, not counted against any category's limit

#### Scenario: Transfers are not uncategorized spend
- **WHEN** a month has 50.00 in uncategorized transactions and a -500.00
  transfer to "Savings"
- **THEN** the budget summary shows 50.00 as uncategorized spend

#### Scenario: Split parts count toward their categories
- **WHEN** a month's only transaction is -60.00 split into -40.00
  "Groceries" and -20.00 with no category
- **THEN** the budget summary shows 40.00 spent in "Groceries" and 20.00
  as uncategorized spend

#### Scenario: Value adjustments are not uncategorized spend
- **WHEN** a month has 50.00 in uncategorized transactions and a
  -8,000.00 value adjustment on "Funds"
- **THEN** the budget summary shows 50.00 as uncategorized spend

### Requirement: Mark a top-level category as a tab group
The system SHALL let the user mark a top-level category as a tab group,
or turn it back into a budget category. Subcategories SHALL NOT be
marked themselves; they show the kind of their parent. A category with
transactions assigned directly to it SHALL NOT become a tab group. The
category settings SHALL ask for confirmation before changing the kind of
a group whose subcategories have transactions.

#### Scenario: Make a tab group
- **WHEN** the user switches the top-level category "Tabs" to "Tab"
- **THEN** "Tabs" is a tab group and its subcategories are tabs

#### Scenario: Subcategories can't be marked
- **WHEN** the user tries to mark the subcategory "Groceries / Supermarket"
  as a tab group
- **THEN** the system rejects the request

#### Scenario: A group with its own transactions can't become a tab group
- **WHEN** transactions are assigned directly to "Temp" and the user
  switches it to "Tab"
- **THEN** the system rejects it and says how many transactions must be
  reassigned first

#### Scenario: Switching a group with rows asks first
- **WHEN** "Tabs / Jan" has transactions and the user switches "Tabs" back
  to "Budget"
- **THEN** the settings ask for confirmation, saying those transactions
  will count in budgets and the dashboard again

### Requirement: Tabs are not budgeted
The budget summary SHALL leave out tab groups and tabs, and the system
SHALL reject setting a limit on them. In the category settings, a tab
group and its tabs SHALL be marked as tabs, and each tab SHALL show its
balance sentence.

#### Scenario: Tabs are not in the summary
- **WHEN** "Tabs / Jan" has -30.00 in the current month
- **THEN** the budget summary lists neither "Tabs" nor "Jan", and the
  30.00 is not uncategorized spend

#### Scenario: No limit on a tab
- **WHEN** the user tries to set a limit on "Tabs / Jan"
- **THEN** the system rejects the request

#### Scenario: Settings show tab balances
- **WHEN** the user opens the category settings and "Jan" is owed 30.00
- **THEN** "Tabs / Jan" is marked as a tab and shows "Jan owes you
  €30.00"

### Requirement: Budgets month in the address
The Budgets page SHALL use the shared month switcher, and SHALL keep the
chosen month in its address, so a link can open it on a given month.
Without a month in the address it SHALL open on the current month in
local time.

#### Scenario: A link opens the right month
- **WHEN** the user opens /budgets?month=2026-09
- **THEN** the budget summary shows September 2026

#### Scenario: Switching updates the address
- **WHEN** the user moves the month switcher from October to September
- **THEN** the address shows month=2026-09, and reloading keeps September

#### Scenario: Local time decides the current month
- **WHEN** it is 1 November 00:30 local time while UTC is still 31
  October, and the user opens /budgets
- **THEN** the page shows November

### Requirement: One budget kind per category
Every budgeted category SHALL have exactly one budget kind: monthly,
yearly, or yearly on a date (see the `yearly-budgets` capability). A new
category SHALL be monthly. Tab groups and tabs SHALL have no kind.

#### Scenario: New categories are monthly
- **WHEN** the user creates a category "Groceries"
- **THEN** "Groceries" is a monthly budget category

#### Scenario: Make a category yearly
- **WHEN** the user switches "Clothing" to yearly with 1200.00 a year
- **THEN** "Clothing" leaves the monthly summary and appears under "This
  year"

#### Scenario: No kind for a tab
- **WHEN** the user tries to give "Tabs / Jan" a yearly budget
- **THEN** the system rejects the request

### Requirement: Switching to or from monthly drops the old amounts
Switching a category from monthly to a yearly kind SHALL delete its
monthly default and overrides. Switching from a yearly kind to monthly
SHALL delete its yearly amounts and their history. When there are
amounts to delete, the Budgets page SHALL ask for confirmation in a
dialog first, saying what will be removed.

#### Scenario: Monthly to yearly
- **WHEN** "Clothing" has a default monthly limit of 100.00 and a
  December override, and the user switches it to yearly
- **THEN** a dialog says the 100.00 monthly limit and 1 month override
  will be removed, and after confirming "Clothing" has no monthly limits
  left

#### Scenario: Yearly to monthly
- **WHEN** "Clothing" is yearly with two years of history and the user
  switches it to monthly
- **THEN** a dialog says its yearly amount and history will be removed

#### Scenario: Nothing to drop
- **WHEN** "Gifts" has no limit and the user switches it to yearly
- **THEN** it switches without asking

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

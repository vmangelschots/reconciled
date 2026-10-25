# Spec Delta

## ADDED Requirements

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
The monthly summary SHALL end with a line showing the month's spending in
yearly and yearly-on-a-date categories, pointing to the "This year"
section, so the month's spending stays complete.

#### Scenario: Yearly spending line
- **WHEN** "Clothing" (yearly) spent 180.00 and "Property tax" (yearly
  on a date) 400.00 this month
- **THEN** the monthly summary ends with "Yearly budgets 580.00 this
  month"

## MODIFIED Requirements

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
the sum of transactions assigned to it in that month, the remaining
amount, and whether it is over its limit. Yearly and yearly-on-a-date
categories SHALL NOT be listed in the monthly summary. Subcategories
SHALL be grouped under their parent for display. Each category's and
subcategory's limit and spend remain independent - a parent's figures
are never a sum of its subcategories' figures, and vice versa.

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
- **WHEN** "Groceries" has 320.00 in transactions assigned directly to
  it, and its subcategory "Supermarket" has 90.00 in transactions
  assigned to "Supermarket" specifically
- **THEN** the summary shows "Supermarket" grouped under "Groceries",
  "Groceries" shows 320.00 spent (not 410.00), and "Supermarket" shows
  90.00 spent against its own limit

#### Scenario: Yearly categories are not in the monthly summary
- **WHEN** "Clothing" is yearly and spent 180.00 this month
- **THEN** the monthly summary doesn't list "Clothing", and its 180.00
  is not uncategorized spend

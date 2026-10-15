# Budgets Specification

## Purpose

Budgets let the user define spending categories and a monthly limit for
each, and see how actual spending in a given month compares to that
limit.

## Requirements

### Requirement: Create and edit category
The system SHALL allow the user to create a spending category with a
name, and to rename it later.

#### Scenario: Create a category
- **WHEN** the user creates a category named "Groceries"
- **THEN** the category is available to assign to transactions and to
  set a monthly limit on

#### Scenario: Category names are unique
- **WHEN** the user attempts to create a category with a name that
  already exists
- **THEN** the system rejects the request

### Requirement: Delete category requires reassignment
The system SHALL block deleting a category that has one or more
transactions assigned to it until the user reassigns those transactions
to another category or to uncategorized.

#### Scenario: Attempt to delete a category in use
- **WHEN** the user attempts to delete "Groceries" while transactions are
  still assigned to it
- **THEN** the system rejects the deletion and indicates how many
  transactions are affected

#### Scenario: Delete after reassignment
- **WHEN** the user reassigns all of "Groceries"'s transactions to
  another category and then deletes "Groceries"
- **THEN** the category is deleted and no transaction references it

### Requirement: Set monthly limit per category
The system SHALL allow the user to set a default monthly spending limit
for a category, and to override that limit for a specific month.

#### Scenario: Set a default limit
- **WHEN** the user sets a default monthly limit of 400.00 for
  "Groceries"
- **THEN** every month without its own override uses 400.00 as the limit

#### Scenario: Override a single month
- **WHEN** the user sets a limit of 600.00 for "Groceries" for December
  only
- **THEN** December uses 600.00 as the limit and all other months
  continue to use the default

### Requirement: View budget period summary
The system SHALL show, for a given month, each category's limit, the sum
of transactions assigned to it in that month, the remaining amount, and
whether it is over its limit.

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

### Requirement: Uncategorized transactions excluded from budgets
The system SHALL exclude uncategorized transactions from every category's
spend total, and SHALL report the total amount of uncategorized
transactions for the month separately.

#### Scenario: Uncategorized spend is shown separately
- **WHEN** a month has 50.00 in uncategorized transactions
- **THEN** the budget summary for that month shows 50.00 as
  uncategorized spend, not counted against any category's limit

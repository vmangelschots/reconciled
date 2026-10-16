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
  set its own monthly limit on, independent of "Groceries"'s limit

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
whether it is over its limit. Subcategories SHALL be grouped under their
parent for display. Each category's and subcategory's limit and spend
remain independent - a parent's figures are never a sum of its
subcategories' figures, and vice versa.

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

### Requirement: Uncategorized transactions excluded from budgets
The system SHALL exclude uncategorized transactions from every category's
spend total, and SHALL report the total amount of uncategorized
transactions for the month separately. Transfers between the user's
accounts SHALL NOT count as uncategorized spend.

#### Scenario: Uncategorized spend is shown separately
- **WHEN** a month has 50.00 in uncategorized transactions
- **THEN** the budget summary for that month shows 50.00 as
  uncategorized spend, not counted against any category's limit

#### Scenario: Transfers are not uncategorized spend
- **WHEN** a month has 50.00 in uncategorized transactions and a -500.00
  transfer to "Savings"
- **THEN** the budget summary shows 50.00 as uncategorized spend

# Spec Delta

## ADDED Requirements

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

# Spec Delta

## MODIFIED Requirements

### Requirement: One budget kind per category
Every budgeted category SHALL have exactly one budget kind: monthly,
yearly, yearly on a date (see the `yearly-budgets` capability), or bills
(see the `bill-budgets` capability). A new category SHALL be monthly. Tab
groups and tabs SHALL have no kind.

#### Scenario: New categories are monthly
- **WHEN** the user creates a category "Groceries"
- **THEN** "Groceries" is a monthly budget category

#### Scenario: Make a category yearly
- **WHEN** the user switches "Clothing" to yearly with 1200.00 a year
- **THEN** "Clothing" shows its figures for the year in the budget list

#### Scenario: Make a category bills
- **WHEN** the user switches "Streaming" to Bills
- **THEN** "Streaming" is a Bills category, without bills until the user
  adds them

#### Scenario: No kind for a tab
- **WHEN** the user tries to give "Tabs / Jan" a yearly budget
- **THEN** the system rejects the request

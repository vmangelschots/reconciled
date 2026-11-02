## MODIFIED Requirements

### Requirement: One budget kind per category
Every budgeted category SHALL have exactly one budget kind: monthly,
yearly, or yearly on a date (see the `yearly-budgets` capability). A new
category SHALL be monthly. Tab groups and tabs SHALL have no kind.

#### Scenario: New categories are monthly
- **WHEN** the user creates a category "Groceries"
- **THEN** "Groceries" is a monthly budget category

#### Scenario: Make a category yearly
- **WHEN** the user switches "Clothing" to yearly with 1200.00 a year
- **THEN** "Clothing" shows its figures for the year in the budget list

#### Scenario: No kind for a tab
- **WHEN** the user tries to give "Tabs / Jan" a yearly budget
- **THEN** the system rejects the request

## REMOVED Requirements

### Requirement: View budget period summary
**Reason**: There is no separate monthly summary any more.
**Migration**: See "One list of budgets", "Budget rows" and "Rows without their own budget" in `budget-overview`. The figures themselves stay under "A parent's budget covers its subcategories".

### Requirement: Yearly spending in the monthly summary
**Reason**: The line pointed from one table to the other.
**Migration**: The same amount is on the headline's line in `budget-overview`, by the same rule of which budget covers the spending.

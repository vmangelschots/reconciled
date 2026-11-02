## MODIFIED Requirements

### Requirement: Start month on the Budgets page
The Budgets page SHALL show the start month at the end of the budget list and
let the user set, change or clear it.

#### Scenario: Set the start month
- **WHEN** the user sets the start month to October 2026
- **THEN** the page shows that yearly budgets count from October 2026 and
  its figures are recalculated

#### Scenario: Clear the start month
- **WHEN** the user clears the start month
- **THEN** every year's yearly budgets count in full

## REMOVED Requirements

### Requirement: This year on the Budgets page
**Reason**: Yearly budgets join the one list.
**Migration**: See "One list of budgets", "Budget rows" and "As-of date for yearly figures" in `budget-overview`. Yearly spending still counts from the later of 1 January and the start month through the end of the viewed month.

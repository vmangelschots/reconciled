# Spec Delta

## MODIFIED Requirements

### Requirement: Uncategorized transactions excluded from budgets
The system SHALL exclude uncategorized transactions from every category's
spend total, and SHALL report the total amount of uncategorized
transactions for the month separately. Transfers between the user's
accounts SHALL NOT count as uncategorized spend. A split transaction
SHALL NOT count as uncategorized spend; its parts SHALL count toward
their own categories, or as uncategorized spend when they have none.

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

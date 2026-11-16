# Spec Delta

## ADDED Requirements

### Requirement: Remove a category's budget
The system SHALL let the user remove a category's budget, whatever its kind.
Removing it SHALL delete its monthly default and overrides, its yearly
amounts and their history, and its bills, and SHALL make it a monthly
category without a limit, as a new category is. The system SHALL reject
removing the budget of a tab or a loan's payment category.

#### Scenario: Remove a monthly budget
- **WHEN** "Groceries" has a default monthly limit of 400.00 and a December
  override, and the user removes its budget
- **THEN** "Groceries" is monthly with no default and no overrides, and has
  no budget in any month

#### Scenario: Remove a yearly budget
- **WHEN** "Clothing" is yearly with two years of history and the user
  removes its budget
- **THEN** "Clothing" is monthly without a limit and has no yearly amounts
  in any year

#### Scenario: Remove a Bills budget
- **WHEN** "Streaming" is a Bills category with three bills and the user
  removes its budget
- **THEN** "Streaming" is monthly without a limit and has no bills

#### Scenario: A parent becomes a group
- **WHEN** "Food" has a limit of 1,000.00 and its subcategory "Restaurant"
  a cap of 100.00, and the user removes "Food"'s budget
- **THEN** "Food" is a plain group and "Restaurant" is compared to its own
  100.00 on its own

#### Scenario: Not for a loan's category
- **WHEN** the user tries to remove the budget of "Mortgage", which a loan
  sets
- **THEN** the system rejects it and says the loan sets that budget

### Requirement: Removing a budget asks first
The Budgets page SHALL ask for confirmation in a dialog before removing a
budget, saying what the saved budget holds that will be removed, and that
the category has no budget in any month afterwards, even when there is
nothing to list. A category without a budget SHALL offer no Remove budget
action.

#### Scenario: Confirm the removal
- **WHEN** the user chooses Remove budget on "Groceries", which has a 400.00
  monthly limit and 1 month override
- **THEN** a dialog says the 400.00 monthly limit and 1 month override will
  be removed and that "Groceries" has no budget in any month after, and
  nothing changes until the user confirms

#### Scenario: Unsaved edits don't change the dialog
- **WHEN** the user picks Yearly on "Groceries" without saving and then
  chooses Remove budget
- **THEN** the dialog still describes its 400.00 monthly limit

#### Scenario: Nothing to list
- **WHEN** the user removes the budget of "Streaming", a Bills category
  without bills
- **THEN** the dialog says "Streaming" will have no budget

#### Scenario: Nothing to remove
- **WHEN** the user opens "Gifts", which is monthly without a limit or
  overrides
- **THEN** its editor shows no Remove budget action

### Requirement: Removing a parent's budget names its subcategories
When the category whose budget is removed has subcategories with budgets of
their own, the dialog SHALL name them and say they keep their budgets.

#### Scenario: Food's subcategories
- **WHEN** the user removes the budget of "Food", whose subcategories
  "Restaurant" has a 100.00 cap and "Groceries" none
- **THEN** the dialog says "Restaurant" keeps its own budget, and doesn't
  name "Groceries"

### Requirement: Remove a month's override
The system SHALL let the user remove the override of a monthly category's
limit for one month, so that month uses the default limit again, or has no
limit when there is no default. Other months SHALL be unchanged. The system
SHALL reject removing an override that does not exist.

#### Scenario: Back to the default
- **WHEN** "Groceries" has a default of 400.00 and 600.00 for December, and
  the user removes December's override
- **THEN** December uses 400.00, and the other months keep theirs

#### Scenario: No default to fall back to
- **WHEN** "Gifts" has no default and 50.00 for December only, and the user
  removes December's override
- **THEN** "Gifts" has no budget in December

#### Scenario: No override that month
- **WHEN** the user tries to remove November's override of "Groceries",
  which has none for November
- **THEN** the system rejects the request

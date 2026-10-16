# Spec Delta

## MODIFIED Requirements

### Requirement: Categorize transaction
The system SHALL allow each transaction to be assigned to at most one
budget category (top-level or subcategory), or left uncategorized. In
the transaction ledger, the system SHALL let the user change a
transaction's category directly from its row via a searchable control
that filters existing categories as the user types, without opening a
separate edit form. If no existing category matches what the user
typed, the system SHALL offer to create a new top-level category with
that name and assign it to the transaction in the same action.

#### Scenario: Assign a category
- **WHEN** the user assigns the category "Groceries" to a transaction
- **THEN** the transaction's amount counts toward the "Groceries" category
  for its transaction month

#### Scenario: Leave a transaction uncategorized
- **WHEN** a transaction has no category assigned
- **THEN** the system still lists it in the ledger but does not count it
  toward any category's spend

#### Scenario: Change a transaction's category inline
- **WHEN** the user clicks a transaction's category cell in the ledger
  and selects a different existing category from the filtered list
- **THEN** the transaction is reassigned to that category immediately,
  without the user opening the row's full edit form

#### Scenario: Filter narrows as the user types
- **WHEN** the user opens the inline category control and types part of
  a category's name
- **THEN** only categories (and subcategories, shown with their parent
  for context) whose name matches what was typed remain selectable

#### Scenario: Create a new category from the inline control
- **WHEN** the user types a name with no matching existing category into
  the inline control and confirms the offered "Create" option
- **THEN** a new top-level category with that name is created and
  immediately assigned to the transaction

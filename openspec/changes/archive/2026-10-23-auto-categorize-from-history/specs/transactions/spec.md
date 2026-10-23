# Spec Delta

## MODIFIED Requirements

### Requirement: Categorize transaction
The system SHALL allow each transaction to be assigned to at most one
budget category (top-level or subcategory), or left uncategorized. A
category the user assigns, from the inline control or the add or edit
form, SHALL be confirmed (see the `auto-categorization` capability).

#### Scenario: Assign a category
- **WHEN** the user assigns the category "Groceries" to a transaction
- **THEN** the transaction's amount counts toward the "Groceries" category
  for its transaction month

#### Scenario: Leave a transaction uncategorized
- **WHEN** a transaction has no category assigned
- **THEN** the system still lists it in the ledger but does not count it
  toward any category's spend

#### Scenario: Saving the edit form confirms the category
- **WHEN** the user opens the edit form of a transaction with an
  unconfirmed "Groceries", changes only its notes and saves
- **THEN** the transaction's category is a confirmed "Groceries"

# Spec Delta

## ADDED Requirements

### Requirement: Transaction form uses the searchable category picker
The add and edit transaction forms SHALL use the searchable category
picker (see the `category-picker` capability) for the category field. Its
"no category" option is "Uncategorized", and subcategories are shown with
their parent. The forms SHALL NOT offer to create a category.

#### Scenario: Pick a category in the add form by typing
- **WHEN** the user tabs to the add form's category field, types "groc"
  and presses Tab
- **THEN** "Groceries" is set as the form's category and focus moves to
  the next field in the form

#### Scenario: Pick a subcategory in the edit form
- **WHEN** the user edits a transaction, types "super" in the category
  field, presses Enter and saves
- **THEN** the transaction is saved with the "Groceries / Supermarket"
  subcategory

### Requirement: Ledger category filter uses the searchable category picker
The ledger's category filter SHALL use the searchable category picker,
with "All" as its "no category" option (no category filter applied).
Subcategories are shown with their parent. The filter SHALL NOT offer to
create a category.

#### Scenario: Filter by typing a category name
- **WHEN** the user focuses the ledger's category filter, types "trans"
  and presses Enter
- **THEN** the ledger lists only transactions in "Transport"

#### Scenario: Clear the filter from the keyboard
- **WHEN** a category filter is applied and the user opens the filter,
  types "all" and presses Enter
- **THEN** the filter is cleared and transactions from all categories are
  listed

### Requirement: Inline category changes show immediately
When the user picks or creates a category from a ledger row's inline
control, the row SHALL show the new category at once, before the server
confirms it, and the ledger SHALL NOT reload to show it. If the server
rejects the change, the row SHALL return to its previous category and the
user SHALL see an error.

#### Scenario: Row updates before the save completes
- **WHEN** the user picks "Groceries" for a row and the save request is
  still in flight
- **THEN** the row already shows "Groceries", and no ledger reload is
  requested

#### Scenario: A failed save reverts the row
- **WHEN** the user picks "Groceries" for a row whose category was
  "Transport" and the save request fails
- **THEN** the row shows "Transport" again and an error message is shown

#### Scenario: A created category shows before it exists on the server
- **WHEN** the user creates "Pets" from a row's inline control
- **THEN** the row shows "Pets" immediately, and keeps showing it once
  the category and the reassignment are saved

# Transactions Specification

## Purpose

The transaction ledger records the flow of money through an account over
time - the record that account balances, budgets, and forecasts are all
computed from.

## Requirements

### Requirement: Create manual transaction
The system SHALL allow the user to manually add a transaction to an
account with a date, an amount (positive for inflow, negative for
outflow), a payee or description, and an optional category.

#### Scenario: Add an expense transaction
- **WHEN** the user adds a transaction to "Main Checking" dated today for
  -42.50 with payee "Grocery Store"
- **THEN** the transaction is created on that account and the account's
  current balance decreases by 42.50

#### Scenario: Amount is required and non-zero
- **WHEN** the user submits a transaction with no amount or an amount of
  zero
- **THEN** the system rejects the request

### Requirement: Edit transaction
The system SHALL allow the user to edit a transaction's date, amount,
payee, category, and notes after it has been created.

#### Scenario: Correct a mistyped amount
- **WHEN** the user edits a transaction's amount from -42.50 to -45.00
- **THEN** the transaction is updated and the account's current balance
  reflects the corrected amount

### Requirement: Delete transaction
The system SHALL allow the user to delete a transaction.

#### Scenario: Delete a transaction
- **WHEN** the user deletes a transaction of -42.50 from an account
- **THEN** the transaction no longer appears in the ledger and the
  account's current balance increases by 42.50

### Requirement: Categorize transaction
The system SHALL allow each transaction to be assigned to at most one
budget category (top-level or subcategory), or left uncategorized.

#### Scenario: Assign a category
- **WHEN** the user assigns the category "Groceries" to a transaction
- **THEN** the transaction's amount counts toward the "Groceries" category
  for its transaction month

#### Scenario: Leave a transaction uncategorized
- **WHEN** a transaction has no category assigned
- **THEN** the system still lists it in the ledger but does not count it
  toward any category's spend

### Requirement: Inline category editing in the ledger
In the transaction ledger, the system SHALL let the user change a
transaction's category directly from its row via a searchable control
that filters existing categories as the user types, without opening a
separate edit form.

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

### Requirement: Create category from the inline control
If no existing category matches what the user typed in the ledger's
inline category control, the system SHALL offer to create a new
top-level category with that name and assign it to the transaction in
the same action.

#### Scenario: Create a new category from the inline control
- **WHEN** the user types a name with no matching existing category into
  the inline control and confirms the offered "Create" option
- **THEN** a new top-level category with that name is created and
  immediately assigned to the transaction

### Requirement: List and filter transactions
The system SHALL allow the user to list an account's transactions and
filter them by date range, category, and a text search over payee and
notes.

#### Scenario: Filter by date range and category
- **WHEN** the user filters an account's transactions to the current
  month and category "Groceries"
- **THEN** the system returns only that account's transactions in the
  current month assigned to "Groceries"

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

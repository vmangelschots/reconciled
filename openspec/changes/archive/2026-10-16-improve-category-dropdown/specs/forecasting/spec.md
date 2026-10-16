# Spec Delta

## ADDED Requirements

### Requirement: Recurring-transaction form uses the searchable category picker
The form for defining and editing a recurring transaction SHALL use the
searchable category picker (see the `category-picker` capability) for its
optional category. Its "no category" option is "Uncategorized", and
subcategories are shown with their parent. The form SHALL NOT offer to
create a category.

#### Scenario: Pick a recurring transaction's category by typing
- **WHEN** the user defines a recurring "Rent" transaction, types "hous"
  in the category field, presses Tab and submits
- **THEN** the recurring definition is saved with the "Housing" category

#### Scenario: Leave a recurring transaction uncategorized
- **WHEN** the user opens the category field without typing and chooses
  "Uncategorized"
- **THEN** the recurring definition is saved with no category

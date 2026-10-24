# Spec Delta

## ADDED Requirements

### Requirement: An empty search lists categories as a tree
While the search is empty, the picker SHALL list the categories as a
tree: top-level categories in alphabetical order, each followed by its
own subcategories in alphabetical order, indented and shown by their own
name. Parents SHALL stay selectable. The "no category" option SHALL come
first, and tabs and transfers SHALL keep their own groups after the
categories.

#### Scenario: Subcategories sit under their parent
- **WHEN** the categories are "Food", "Food / Lunch", "Groceries",
  "Groceries / Supermarket" and "Transport", and the user opens the
  picker
- **THEN** the options read "Uncategorized", "Food", "Lunch",
  "Groceries", "Supermarket", "Transport", with "Lunch" and
  "Supermarket" indented under their parents

#### Scenario: A parent can be picked
- **WHEN** the user opens the picker and chooses "Groceries"
- **THEN** "Groceries" itself is selected

### Requirement: Search results show a subcategory's parent
While the search is non-empty, a matching subcategory SHALL be listed by
its own name with its parent's name shown beside it, muted. Matching and
ranking SHALL stay as they are.

#### Scenario: A subcategory match names its parent
- **WHEN** the user types "lun"
- **THEN** the option reads "Lunch" with "Food" beside it, and choosing
  it selects "Food / Lunch"

#### Scenario: Searching by the parent's name still finds children
- **WHEN** the user types "groc"
- **THEN** "Groceries" is listed first and "Supermarket" (beside
  "Groceries") after it

### Requirement: Keyboard order follows the visible order
Arrow Up and Arrow Down SHALL move through the options in the order they
are shown, so in the tree a parent is followed by its children before
the next parent.

#### Scenario: Arrowing through the tree
- **WHEN** the picker shows "Uncategorized", "Food", "Lunch", "Groceries"
  with "Uncategorized" highlighted, and the user presses Arrow Down twice
- **THEN** "Lunch" is highlighted

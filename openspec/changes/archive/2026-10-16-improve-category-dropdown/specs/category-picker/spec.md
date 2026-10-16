# Spec Delta

## Purpose

The searchable control the user picks a category with wherever the app
asks for one. It's built so a category can be found and chosen by typing,
without touching the mouse.

## ADDED Requirements

### Requirement: Type to open the picker
When the category picker has keyboard focus and is closed, typing a
printable character SHALL open it with the search pre-filled with that
character. Enter, Space and Arrow Down SHALL open it with an empty search.

#### Scenario: Typing on the focused picker starts a search
- **WHEN** the user tabs onto a closed category picker and types "g"
- **THEN** the picker opens, the search field contains "g" and has focus,
  and the list is narrowed to categories matching "g"

#### Scenario: Modifier shortcuts are not captured
- **WHEN** the closed picker has focus and the user presses Ctrl+R
- **THEN** the picker stays closed and the browser shortcut runs as usual

### Requirement: Matches are ranked
While the search is non-empty, the picker SHALL list a category only if
its displayed label (including "Parent / " for subcategories) contains
the search text, case-insensitively. Categories whose own name starts
with the search text SHALL be listed first, then those whose label starts
with it, then those that only contain it, keeping the original order
within each group.

#### Scenario: Prefix matches come first
- **WHEN** the categories are "Eating out", "Groceries / Meat" and "Meals",
  and the user types "mea"
- **THEN** "Groceries / Meat" and "Meals" are listed before any
  category that only contains "mea" elsewhere in its label

### Requirement: Best match is highlighted while typing
While the search is non-empty, the picker SHALL highlight the
highest-ranked match. If nothing matches and creating is allowed, it
SHALL highlight the "Create" option instead.

#### Scenario: Enter picks the best match, not the clear option
- **WHEN** the user opens the picker, types "groc" and presses Enter
- **THEN** "Groceries" is selected, not the "no category" option

#### Scenario: Create is highlighted when nothing matches
- **WHEN** creating is allowed and the user types "Pets", which matches no
  category, then presses Enter
- **THEN** a category named "Pets" is created and selected

### Requirement: The "no category" option is highlighted only on an empty search
The picker's "no category" option (for example "Uncategorized", "All" or
"No parent (top-level)") SHALL be listed while the search is empty. While
the search is non-empty, it SHALL be listed only if its own label
contains the search text, ranked after every category match.

#### Scenario: Clear option is hidden while searching
- **WHEN** the user types "trans" in a picker whose clear option is
  "Uncategorized"
- **THEN** "Uncategorized" is not listed

#### Scenario: Clear option can still be found by typing
- **WHEN** the user types "uncat"
- **THEN** "Uncategorized" is listed and highlighted

### Requirement: Opening highlights the current value
When the picker opens with an empty search, it SHALL highlight the
currently selected category, or the "no category" option if nothing is
selected.

#### Scenario: Enter without typing leaves the value unchanged
- **WHEN** the picker's value is "Transport" and the user opens it and
  presses Enter without typing
- **THEN** the value stays "Transport"

### Requirement: Keyboard confirmation and dismissal
Arrow Up and Arrow Down SHALL move the highlight. Enter SHALL choose the
highlighted option and return focus to the picker. Tab SHALL choose the
highlighted category (or the clear option) and move focus to the next
focusable element, and Shift+Tab to the previous one. Tab SHALL NOT
create a category. Escape SHALL close the picker without changing the
value. Every way of closing SHALL clear the search.

#### Scenario: Tab accepts and moves on
- **WHEN** the user types "trans" in the picker and presses Tab
- **THEN** "Transport" is selected and focus moves to the next field
  after the picker

#### Scenario: Tab with no match changes nothing
- **WHEN** creating is allowed, the user types "Pets" (no match) and
  presses Tab
- **THEN** no category is created, the value is unchanged, and focus
  moves to the next field

#### Scenario: Escape cancels
- **WHEN** the user types "trans" and presses Escape
- **THEN** the picker closes, the value is unchanged, and focus is back
  on the picker

#### Scenario: Reopening starts with a fresh search
- **WHEN** the user types "trans", presses Escape, then presses Enter
  on the picker
- **THEN** the picker opens with an empty search

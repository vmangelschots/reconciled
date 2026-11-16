# Spec Delta

## ADDED Requirements

### Requirement: Removing from the budget sheet
The editor SHALL offer Remove budget for a category with a budget, and a
Bills sheet SHALL also offer it next to Edit bills. When the viewed month has
its own limit, the editor SHALL offer Use default, or Remove <Month>'s limit
without a default. Either action SHALL close the sheet with a toast saying
what changed; Use default's toast SHALL offer Undo. A row that lands under
"No budget" SHALL be shown, with the group open.

#### Scenario: Remove a budget from the sheet
- **WHEN** the user opens "Groceries", chooses Remove budget and confirms
- **THEN** the sheet closes, a toast says "Groceries" has no budget now, and
  the "No budget" group is open with "Groceries" highlighted in it

#### Scenario: Remove a Bills budget from the sheet
- **WHEN** the user opens "Streaming" and chooses Remove budget next to Edit
  bills, then confirms
- **THEN** the sheet closes and "Streaming" is listed under "No budget"

#### Scenario: Use the default for a month
- **WHEN** the user opens "Groceries" in December, which has 600.00 for
  December only and a default of 400.00
- **THEN** the editor offers "Use default (€400)", and choosing it closes the
  sheet, shows "Groceries" with 400.00 for December, and the toast says
  "Groceries is back to €400 for December." with Undo

#### Scenario: Undo Use default
- **WHEN** the user chooses Undo on that toast
- **THEN** December's limit for "Groceries" is 600.00 again

#### Scenario: No default to use
- **WHEN** "Gifts" has 50.00 for December only and no default
- **THEN** the editor offers "Remove December's limit" instead

### Requirement: Editing a month with its own limit
When the viewed month has its own limit, the editor SHALL start with "This
month only" ticked, so saving a new amount changes that month and not the
default.

#### Scenario: Change December's own limit
- **WHEN** "Groceries" has a default of 400.00 and 600.00 for December, and
  the user opens it in December, enters 650 and saves
- **THEN** December's limit is 650.00 and the default stays 400.00

#### Scenario: Change the default from an ordinary month
- **WHEN** the user opens "Groceries" in November, which has no limit of its
  own, enters 450 and saves
- **THEN** the default is 450.00

### Requirement: A zero amount is explained
When the user enters 0 as a monthly amount, the editor SHALL say that 0
means nothing may be spent, and point to Remove budget when the category has
a budget.

#### Scenario: Typing 0
- **WHEN** the user enters 0 as "Groceries"'s monthly amount
- **THEN** the editor says 0 means nothing may be spent and that Remove
  budget leaves it without a budget

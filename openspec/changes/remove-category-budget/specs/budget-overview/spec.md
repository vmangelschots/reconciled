# Spec Delta

## MODIFIED Requirements

### Requirement: Budget sheet
Clicking a budget, No budget or subcategory row SHALL open a sheet with that
category's figures, its budget editor and the viewed month's transactions. A
Bills category's sheet SHALL show its bill list instead of the editor, and
collapse the transactions to "N transactions in <Month>", which opens them. It
SHALL open from the side, or from the bottom on a phone. Saving SHALL close it
and briefly highlight the row. The editor SHALL offer Remove budget for a
category with a budget, and Use default when the viewed month has its own
override; either SHALL close the sheet with a toast saying what changed.

#### Scenario: Set a limit from the sheet
- **WHEN** the user clicks "Groceries", changes its amount and saves
- **THEN** the sheet closes, a toast confirms it, and the row shows the new
  limit and is highlighted

#### Scenario: A parent's transactions
- **WHEN** the user opens "Food", which covers its subcategories
- **THEN** the sheet lists the month's transactions in "Food" and its
  subcategories

#### Scenario: Fix a category from the sheet
- **WHEN** the user changes a transaction's category in the sheet
- **THEN** the sheet's rows and the page's figures refresh

#### Scenario: A yearly budget shows the viewed month
- **WHEN** the user opens "Clothing" (yearly)
- **THEN** the sheet shows its figures for the year, and transactions for the
  viewed month only, saying which month

#### Scenario: Rename from the sheet
- **WHEN** the user wants to rename the category
- **THEN** the sheet links to the category settings

#### Scenario: A Bills sheet stays short
- **WHEN** the user opens "Streaming" in November, which has 4 transactions
- **THEN** the sheet shows its bills and "4 transactions in November",
  which lists them when chosen

#### Scenario: Remove a budget from the sheet
- **WHEN** the user opens "Groceries", chooses Remove budget and confirms
- **THEN** the sheet closes, a toast says "Groceries" has no budget now, and
  "Groceries" is listed under "No budget"

#### Scenario: Remove a Bills budget from the sheet
- **WHEN** the user opens "Streaming", chooses Edit bills, then Remove budget
  and confirms
- **THEN** the sheet closes and "Streaming" is listed under "No budget"

#### Scenario: Use the default for a month
- **WHEN** the user opens "Groceries" in December, which has 600.00 for
  December only and a default of 400.00
- **THEN** the editor offers "Use default (€400)", and choosing it closes the
  sheet and shows "Groceries" with 400.00 for December

# Transaction Splits Specification

## Purpose
Lets the user divide one transaction into parts with their own amounts and
categories or transfer targets, so a single bank line that paid for several
things is counted correctly everywhere.

## Requirements

### Requirement: Split a transaction into parts
The system SHALL allow the user to split a transaction into two or more
parts. Each part SHALL have a non-zero amount with the same sign as the
transaction, and a category, a transfer target or no category, plus
optional notes. The parts SHALL add up exactly to the transaction's
amount. A split transaction SHALL have no category and SHALL NOT be a
transfer itself. A transfer SHALL NOT be split, and a part SHALL NOT be
split again.

#### Scenario: Split a dinner in two
- **WHEN** the user splits a -60.00 "Pizzeria" transaction into -30.00
  "Restaurants" and -30.00 with no category
- **THEN** the transaction is split into those two parts and has no
  category of its own

#### Scenario: Parts must add up
- **WHEN** the user tries to split a -60.00 transaction into -30.00 and
  -20.00
- **THEN** the system rejects the split and the transaction is unchanged

#### Scenario: At least two parts
- **WHEN** the user tries to split a transaction into a single part
- **THEN** the system rejects the split

#### Scenario: Parts keep the transaction's sign
- **WHEN** the user tries to split a -60.00 transaction into -70.00 and
  +10.00
- **THEN** the system rejects the split

#### Scenario: Splitting a categorized transaction
- **WHEN** a transaction with the category "Groceries" is split
- **THEN** the transaction itself no longer has a category; only its parts
  do

#### Scenario: A transfer can't be split
- **WHEN** the user tries to split a transaction that is a transfer to
  "Savings"
- **THEN** the system rejects it and the transfer stays linked

#### Scenario: A split transaction can't be given a category or transfer
- **WHEN** the user tries to set a category on, or mark as a transfer, a
  transaction that is split
- **THEN** the system rejects the change and the split is unchanged

#### Scenario: Parts can't be split
- **WHEN** the user tries to split a part of a split transaction
- **THEN** the system rejects it

### Requirement: Parts share the transaction's date and payee
A part SHALL always have its transaction's date and payee. Changing the
date of a split transaction SHALL move its parts to the new date. The
amount of a split transaction SHALL NOT be changeable while it is split.

#### Scenario: Date change moves the parts
- **WHEN** the user changes a split transaction's date from 3 March to 4
  March
- **THEN** its parts are dated 4 March too

#### Scenario: Amount is locked while split
- **WHEN** the user tries to change the amount of a split transaction
- **THEN** the system rejects the change and explains that it must be
  unsplit first

### Requirement: Parts behave like transactions
Each part SHALL be categorized, recategorized, or made a transfer the
same way a whole transaction is, including from its own category cell in
the ledger. A part that is a transfer SHALL follow the account-transfers
rules for matching, creating, unlinking and mirroring edits to its
counterpart.

#### Scenario: A part becomes a transfer
- **WHEN** the user picks "Savings" in the category cell of a -30.00 part
  of a split "Checking" transaction, and "Savings" has no matching
  transaction
- **THEN** the part becomes a transfer to "Savings" and a +30.00
  transaction is created in "Savings", linked to the part

#### Scenario: Recategorize a part from the ledger
- **WHEN** the user picks "Household" in the category cell of a part
  currently in "Groceries"
- **THEN** that part's category is "Household" and the other parts are
  unchanged

### Requirement: Edit a split
The system SHALL allow the user to change a split's parts: add, remove,
or change each part's amount, category or transfer target, and notes,
under the same rules as when splitting. Removing a part that is a transfer
SHALL unlink it as deleting a transfer does.

#### Scenario: Rebalance two parts
- **WHEN** a -60.00 split has parts -30.00 "Restaurants" and -30.00
  "Gifts", and the user changes them to -40.00 and -20.00
- **THEN** the parts are -40.00 "Restaurants" and -20.00 "Gifts"

#### Scenario: Removing a transfer part removes its created counterpart
- **WHEN** a part that is a transfer to "Savings" with a counterpart the
  app created is removed from the split, and the remaining parts still add
  up
- **THEN** the counterpart in "Savings" is deleted

### Requirement: Unsplit a transaction
The system SHALL allow the user to unsplit a transaction. Unsplitting
SHALL remove its parts and give the transaction the category or transfer
target the user chose to keep, or leave it uncategorized when none was
chosen. A part that was a transfer SHALL be unlinked as deleting a
transfer does.

#### Scenario: Unsplit to no category
- **WHEN** the user unsplits a transaction split into "Restaurants" and
  "Gifts" without choosing a category to keep
- **THEN** it has no parts and is uncategorized

#### Scenario: Unsplit keeps a chosen category
- **WHEN** the user unsplits a transaction and keeps "Restaurants"
- **THEN** it has no parts and its confirmed category is "Restaurants"

#### Scenario: Unsplit with a real transfer counterpart
- **WHEN** a split has a part linked as a transfer to a "Savings"
  transaction that came from an import, and the user unsplits it
- **THEN** the "Savings" transaction stays, as a normal uncategorized
  transaction

### Requirement: Deleting a split transaction
Deleting a split transaction SHALL delete its parts, unlinking any part
that is a transfer as deleting a transfer does. A part SHALL NOT be
deleted on its own outside of editing the split.

#### Scenario: Delete a split transaction
- **WHEN** the user deletes a split transaction with a part that is a
  transfer to "Savings" whose counterpart the app created
- **THEN** the transaction, its parts and that counterpart are deleted

### Requirement: Show splits in the ledger
The ledger SHALL list a split transaction once, with "Split" and its
number of parts in its category cell, and SHALL list its parts directly
beneath it as one visual group. A part row SHALL show its amount, notes
and own category cell, but not the date and payee, and SHALL offer no
delete action; its edit action SHALL open the split editor. Parts SHALL
NOT appear as separate top-level rows.

#### Scenario: Split row and its parts
- **WHEN** the ledger shows a -60.00 "Pizzeria" transaction split into
  -30.00 "Restaurants" and -30.00 "Gifts"
- **THEN** it shows one "Pizzeria" row reading "Split · 2", with the two
  parts grouped beneath it without their own date or payee

#### Scenario: Editing a part opens the split editor
- **WHEN** the user chooses edit on a part row
- **THEN** the split editor opens for its transaction

### Requirement: Open the split editor from the ledger
The category picker of an unsplit, non-transfer ledger row SHALL offer
"Split…", listed after the categories, or first while the search text is
the start of "split". Choosing it SHALL open the split editor under the
row. Opening the category cell of a split transaction SHALL open the
editor directly. Only one split editor or edit form SHALL be open at a
time.

#### Scenario: A split row's cell opens the editor
- **WHEN** the user opens the category cell of a split transaction
- **THEN** the editor opens with its current parts and offers "Unsplit"

#### Scenario: Typing finds Split before matching categories
- **WHEN** a category "Sports" exists and the user types "sp" in a row's
  picker and presses Enter
- **THEN** the split editor opens

#### Scenario: Parts and transfers don't offer Split
- **WHEN** the user opens the category cell of a part, or of a transfer
- **THEN** the picker does not offer "Split…"

#### Scenario: One editor at a time
- **WHEN** a split editor is open and the user opens the edit form of
  another row
- **THEN** the split editor closes

### Requirement: Split editor replaces the parts while open
While the split editor is open, it SHALL show one line per part in place
of the part rows. Each line SHALL have an amount entered without a sign,
which takes the transaction's sign, a category picker offering categories
and transfer targets, and notes.

#### Scenario: Lines replace part rows
- **WHEN** the user opens the editor of a transaction split into two parts
- **THEN** the two part rows are hidden and the editor shows two lines
  with their unsigned amounts, categories and notes

### Requirement: The first line takes the remainder
In the split editor, the first line SHALL hold the transaction's amount
minus the other lines until the user edits its amount. A new split SHALL
start with the first line holding the full amount and the current
category, and an empty second line with focus on its amount.

#### Scenario: Split a dinner with one number
- **WHEN** the user picks "Split…" on a -60.00 "Restaurants" row and types
  30 in the second line's amount
- **THEN** the first line shows 30.00 "Restaurants" and nothing is left
  to assign

#### Scenario: An edited first line stops following
- **WHEN** the user sets the first line to 20 and then types 30 in the
  second line of a 60.00 split
- **THEN** the first line stays 20.00 and 10.00 is left to assign

### Requirement: Split editor shows what is left to assign
The split editor SHALL show, without a sign, the amount still left to
assign, the amount over-assigned, or that everything is assigned, and
SHALL say when a line has no amount. Saving SHALL be possible only when
everything is assigned and every line has an amount.

#### Scenario: Left to assign
- **WHEN** the lines of a 60.00 split add up to 50.00
- **THEN** the editor shows "€10.00 left to assign" and saving is not
  possible

#### Scenario: Over-assigned
- **WHEN** the lines of a 60.00 split add up to 65.00
- **THEN** the editor shows "€5.00 over" and saving is not possible

#### Scenario: A line without an amount
- **WHEN** a split editor has a line with no amount
- **THEN** the editor says a part needs an amount and saving is not
  possible

### Requirement: Split editor works from the keyboard
In the split editor, Tab SHALL move through each line's amount, category
and notes, then the next line. Enter in an amount or notes field SHALL
save when saving is possible. Escape SHALL cancel and return focus to the
row's category cell. Entering an amount on the last line while money is
still left to assign SHALL add a new empty line.

#### Scenario: Enter saves
- **WHEN** everything is assigned and the user presses Enter in a notes
  field
- **THEN** the split is saved

#### Scenario: Escape cancels
- **WHEN** the user has changed lines and presses Escape
- **THEN** the editor closes, the split is unchanged and focus is on the
  row's category cell

#### Scenario: A new line appears while money is left
- **WHEN** the first line was set to 20 in a 60.00 split and the user
  types 30 in the last line
- **THEN** a new empty line is added for the remaining 10.00

### Requirement: Unsplit from the editor
The split editor of a split transaction SHALL offer "Unsplit", which
SHALL keep the category or transfer target all parts share, or none if
they differ. When the editor is down to one line, saving SHALL unsplit
the transaction to that line's category or transfer target, and the save
button SHALL say so.

#### Scenario: Unsplit restores a shared category
- **WHEN** both parts of a split are in "Groceries" and the user chooses
  "Unsplit"
- **THEN** the transaction is unsplit with the category "Groceries"

#### Scenario: Down to one line
- **WHEN** the user removes the second line of a split, leaving a
  "Restaurants" line
- **THEN** the save button reads "Unsplit to Restaurants" and saving
  leaves the transaction unsplit in "Restaurants"

### Requirement: Split editor errors show on their line
When saving a split fails, the editor SHALL stay open with the user's
lines, show the error, and mark the line it concerns when the error
belongs to one line.

#### Scenario: Transfer target refused
- **WHEN** saving fails because a line's transfer target was archived in
  the meantime
- **THEN** the editor stays open and that line is marked with the error

### Requirement: Split transactions in the transaction form
The edit transaction form SHALL show a split transaction's parts
read-only in place of the category field, with an "Edit split" action
that opens the split editor. It SHALL NOT allow changing the amount, and
SHALL say that unsplitting is needed to change it. The form SHALL NOT
offer to split a transaction.

#### Scenario: Edit a split transaction's payee
- **WHEN** the user opens the edit form of a split transaction
- **THEN** the form lists its parts read-only, the amount cannot be
  changed, and the payee, date and notes can be

#### Scenario: Edit split from the form
- **WHEN** the user chooses "Edit split" in that form
- **THEN** the form closes and the split editor opens for the transaction

### Requirement: Filter the ledger by a part's category
Filtering the ledger by a category SHALL include a split transaction when
any of its parts has that category, shown with all its parts, with the
parts in other categories de-emphasised. The text search SHALL also match
a part's notes.

#### Scenario: Filter finds a split
- **WHEN** the user filters by "Restaurants" and a split transaction has
  one part in "Restaurants" and one in "Gifts"
- **THEN** that split transaction is listed with both parts, and the
  "Gifts" part is de-emphasised

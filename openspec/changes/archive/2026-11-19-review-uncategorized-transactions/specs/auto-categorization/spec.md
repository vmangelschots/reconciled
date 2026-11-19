# Spec Delta

## ADDED Requirements

### Requirement: Review page lists uncategorized transactions by payee
The Review page SHALL list every uncategorized, non-transfer transaction
across all accounts in a "No category yet" section below the history and
AI guess groups. Its groups SHALL share a normalized payee and a
direction, and SHALL be ordered by transaction count, largest first, most
recent first on a tie. Each group SHALL show its payee, count, total
amount, date span and account names; it has no guessed category, evidence
or confirm action.

#### Scenario: Unmatched rows are grouped by payee
- **WHEN** three uncategorized outflows from Delhaize and one from Shell
  match neither history nor AI
- **THEN** the Review page lists a Delhaize group of 3 above a Shell group
  of 1 under "No category yet"

#### Scenario: Direction splits the groups
- **WHEN** a payee has two uncategorized outflows and one uncategorized
  inflow
- **THEN** the Review page shows them as an outflow group of 2 and an
  inflow group of 1

#### Scenario: Uncategorized rows come after the guesses
- **WHEN** the page shows a history group of 5, an AI group of 2 and an
  uncategorized group of 9
- **THEN** the uncategorized group is listed last, under "No category yet"

#### Scenario: A group shows where its rows came from
- **WHEN** a payee's three uncategorized rows span a Checking and a Joint
  account between 2 and 20 October
- **THEN** its group shows 3 transactions, both account names and that
  date span

### Requirement: Categorize a group that has no category
A group with no category SHALL have no confirm action. Picking a category
in the group's picker SHALL set that category on all of its transactions
and confirm them as manually categorized. The group SHALL leave the page
at once, and a failed save SHALL bring it back with an error.

#### Scenario: Categorize a whole payee
- **WHEN** the user picks "Groceries" for the Delhaize group of 3 under
  "No category yet"
- **THEN** all three transactions are confirmed "Groceries" and the group
  leaves the page

#### Scenario: A failed save brings the group back
- **WHEN** the user picks a category for a group with no category and the
  save fails
- **THEN** the group shows again, still uncategorized, and an error
  message is shown

#### Scenario: Categorizing here teaches history
- **WHEN** the user categorizes three uncategorized rows from a payee that
  had no categorized history
- **THEN** a later transaction from that payee is guessed from that
  history

## MODIFIED Requirements

### Requirement: Review works from the keyboard
When the Review page opens with groups, focus SHALL be on the first
group's confirm control, or on its category picker when that group is an
AI guess or has no category. When a group leaves the page, focus SHALL
move to the equivalent control of the group that takes its place, or of
the previous group if it was the last. When that group is an AI guess or
has no category, focus SHALL go to its category picker instead, so
confirming a guess or picking a category always takes a deliberate step.

#### Scenario: Review a page of groups with Enter
- **WHEN** the Review page shows three history groups and the user presses
  Enter three times
- **THEN** all three groups are confirmed and the page shows its next work

#### Scenario: Focus stops before AI guesses
- **WHEN** the user confirms the last history group and an AI group comes
  next
- **THEN** focus moves to the AI group's category picker, not its confirm
  control, and pressing Enter opens the picker instead of confirming

#### Scenario: Focus stops before uncategorized rows
- **WHEN** the user confirms the last AI group and a "No category yet"
  group comes next
- **THEN** focus moves to that group's category picker

#### Scenario: A page with only uncategorized rows
- **WHEN** the Review page opens with only "No category yet" groups
- **THEN** focus is on the first group's category picker

### Requirement: Navigation shows the review count
The navigation SHALL include a Review entry that shows how many
transactions the Review page asks the user to act on: unconfirmed guesses
plus uncategorized transactions. It SHALL hide that count when there are
none. The count SHALL update after the user confirms guesses, picks
categories, or runs a backfill, and when the user navigates between pages.

#### Scenario: Count after an import
- **WHEN** an import commits with 14 guessed transactions and nothing else
  is unconfirmed or uncategorized
- **THEN** the Review entry shows 14

#### Scenario: The count includes uncategorized rows
- **WHEN** 14 unconfirmed guesses and 5 uncategorized transactions await
  review
- **THEN** the Review entry shows 19

#### Scenario: No count when nothing needs review
- **WHEN** every transaction has a confirmed category
- **THEN** the Review entry shows no count

### Requirement: Categorize uncategorized transactions from the Review page
The Review page SHALL offer to guess the categories of its uncategorized,
non-transfer transactions across all accounts, from history and, when AI
is configured, from AI. The action SHALL stay available with the "No
category yet" section, whether or not guess groups are shown. After the
run the page SHALL report how many got a category out of how many were
tried, split by source when AI contributed, and list the new guesses;
rows still without a category SHALL stay listed. When AI is configured
and nothing got a category, it SHALL offer to try again. With nothing
unconfirmed and nothing uncategorized, the page SHALL say there is
nothing to review and offer no backfill.

#### Scenario: Backfill existing transactions
- **WHEN** 40 transactions are uncategorized, 25 of them from payees with
  confirmed history, AI isn't configured, and the user chooses to guess
  their categories
- **THEN** those 25 get unconfirmed categories, the page reports 25 of 40,
  their groups are listed above the 15 that stayed without a category

#### Scenario: Backfill while guesses wait
- **WHEN** the page shows six guess groups and 30 uncategorized rows, and
  the user runs the backfill
- **THEN** the guess groups stay, the new guesses are added, and the rows
  still without a category stay listed below

#### Scenario: Backfill with AI
- **WHEN** AI is configured, 40 transactions are uncategorized, 25 of them
  match history, and the model guesses 10 of the other 15
- **THEN** the page reports 35 of 40, 25 from history and 10 by AI, and
  lists the history groups above the AI groups

#### Scenario: Nothing guessed with AI on
- **WHEN** AI is configured and a backfill of 40 transactions guesses none
- **THEN** the page says that no category could be guessed for the 40,
  keeps them listed, and offers to try again

#### Scenario: Nothing left to do
- **WHEN** nothing is unconfirmed and every non-transfer transaction has a
  category
- **THEN** the Review page says there's nothing to review and offers no
  backfill

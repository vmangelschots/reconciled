# Auto Categorization Specification

## Purpose

Auto-categorization guesses a category for each new transaction from how the
user categorized the same payee before. The user then confirms or corrects
those guesses on a Review page, payee by payee, instead of categorizing
every row by hand.

## Requirements

### Requirement: Guess a category from confirmed history
The system SHALL guess a transaction's category from the user's confirmed,
non-transfer transactions on any account with the same normalized payee
and the same direction (inflow or outflow). It SHALL pick the category used
most often, and on a tie the one used most recently. Normalizing SHALL
ignore case, digits, punctuation and extra whitespace. With no such history,
the transaction SHALL stay uncategorized.

#### Scenario: A repeat payee gets its usual category
- **WHEN** the user has confirmed "Groceries" on three outflows from
  "CARREFOUR MARKET 1234" and a new outflow from "Carrefour Market 0987"
  is categorized
- **THEN** it gets "Groceries"

#### Scenario: Most frequent category wins
- **WHEN** a payee's confirmed outflows are "Groceries" four times and
  "Household" once
- **THEN** a new outflow from that payee gets "Groceries"

#### Scenario: A tie goes to the most recent category
- **WHEN** a payee's confirmed outflows are "Groceries" twice and
  "Household" twice, and the latest of them is "Household"
- **THEN** a new outflow from that payee gets "Household"

#### Scenario: Inflows and outflows are matched separately
- **WHEN** a payee's only confirmed history is outflows in "Groceries" and
  a new inflow from that payee is categorized
- **THEN** the inflow stays uncategorized

#### Scenario: Unknown payee stays uncategorized
- **WHEN** a transaction's normalized payee matches no confirmed
  transaction
- **THEN** it stays uncategorized

### Requirement: History learns only from confirmed categories
Unconfirmed categories SHALL NOT count as history when guessing. Parts of
a split transaction SHALL NOT count as history either.

#### Scenario: A guess does not reinforce itself
- **WHEN** a payee's only categorized transaction has the unconfirmed
  category "Dining" and a new transaction from that payee is categorized
- **THEN** the new transaction stays uncategorized

#### Scenario: Parts are not history
- **WHEN** a payee's only categorized history is a "Restaurants" part of a
  split transaction, and a new transaction from that payee is categorized
- **THEN** the new transaction stays uncategorized

### Requirement: The categorizer only fills empty categories
The categorizer SHALL only set a category on a transaction that has none
and is not a transfer. It SHALL never change an existing category,
confirmed or not. It SHALL skip split transactions and their parts, and
the Review page SHALL NOT count them as uncategorized.

#### Scenario: An existing category is kept
- **WHEN** the categorizer runs over a transaction that already has the
  unconfirmed category "Transport"
- **THEN** its category stays "Transport"

#### Scenario: Transfers are skipped
- **WHEN** the categorizer runs over an account containing a transfer to
  "Savings"
- **THEN** the transfer stays a transfer with no category

#### Scenario: Splits are skipped
- **WHEN** the categorizer runs over a split transaction that has a part
  with no category
- **THEN** neither the split transaction nor that part gets a category,
  and neither is counted as uncategorized on the Review page

### Requirement: Guessed categories are unconfirmed and record their source
A category the categorizer sets SHALL be marked unconfirmed, with its
source: "history" or "ai". A category the user assigns or confirms SHALL be
confirmed.

#### Scenario: A guess is unconfirmed
- **WHEN** the categorizer sets "Groceries" on a transaction from history
- **THEN** the transaction's category is "Groceries", unconfirmed, with
  source "history"

#### Scenario: An AI guess is unconfirmed
- **WHEN** the categorizer sets "Eating out" on a transaction from an AI
  guess
- **THEN** the transaction's category is "Eating out", unconfirmed, with
  source "ai"

### Requirement: Unconfirmed categories count like confirmed ones
Budgets and the dashboard SHALL count a transaction under its category
whether that category is confirmed or not.

#### Scenario: A guess counts toward its budget
- **WHEN** the categorizer sets "Groceries" on a -40.00 transaction this
  month and nobody has confirmed it yet
- **THEN** this month's "Groceries" spend includes the 40.00

### Requirement: Ledger marks guessed categories by source
The transaction ledger SHALL show an unconfirmed category differently from
a confirmed one: with an icon for its source and a different style for its
label, without widening the category column. A history guess and an AI
guess SHALL use different icons. In the ledger, picking a category for the
row confirms it, including picking the category it already has.

#### Scenario: A history guess is marked
- **WHEN** the ledger lists one transaction with an unconfirmed
  "Groceries" from history and one with a confirmed "Groceries"
- **THEN** only the first row shows the history icon and the guess style

#### Scenario: Re-picking a guess confirms it
- **WHEN** the user opens the picker on a row with an unconfirmed
  "Groceries" and presses Enter without typing
- **THEN** the row shows "Groceries" as confirmed

### Requirement: Review page groups guesses by payee
The system SHALL offer a Review page that lists every unconfirmed
transaction across all accounts, in groups that share a normalized payee,
a direction, a guessed category and a source. History groups SHALL come
first and AI groups after them, in their own section; within each, groups
SHALL be ordered by transaction count, largest first. Each group SHALL show
its payee, count, total amount, date span, account names, guessed category
and evidence.

#### Scenario: Guesses are grouped
- **WHEN** five unconfirmed outflows from Carrefour Market are guessed as
  "Groceries" and four from NMBS as "Transport"
- **THEN** the Review page shows a Carrefour Market group of 5 above an
  NMBS group of 4, each with its total, date span and accounts

#### Scenario: Different guesses for one payee are separate groups
- **WHEN** a payee has three unconfirmed rows guessed as "Groceries" and
  one guessed as "Household"
- **THEN** the Review page shows them as two groups

#### Scenario: AI guesses come after history guesses
- **WHEN** there is a history group of 2 and an AI group of 6
- **THEN** the history group is listed first, and the AI group is listed
  below it under an "AI guesses" heading

### Requirement: Review groups show their evidence
Each Review group SHALL state in visible text why its category was
guessed. For a history guess this is how many of the payee's earlier
confirmed transactions in that direction had that category, out of how
many in total. For an AI guess it SHALL say that the guess is by AI and
show the guessed category and the model's short reason.

#### Scenario: History evidence
- **WHEN** a payee has 8 confirmed outflows, 7 of them "Groceries", and a
  group of its new outflows is guessed as "Groceries"
- **THEN** the group shows that 7 of 8 earlier payments to that payee were
  Groceries

#### Scenario: AI evidence
- **WHEN** a group was guessed by AI as "Eating out" with the reason
  "Restaurant name"
- **THEN** the group says it is an AI guess for "Eating out" and shows
  "Restaurant name"

### Requirement: Confirm or correct a whole group
A Review group SHALL be confirmable in one action, which confirms the
guessed category on all of its transactions. Picking a different category
in the group's picker SHALL apply that category to all of its
transactions and confirm them. A resolved group SHALL leave the page at
once, and failure SHALL bring it back with an error.

#### Scenario: Confirm a group
- **WHEN** the user confirms the Carrefour Market group of 5 guessed as
  "Groceries"
- **THEN** all five transactions are confirmed "Groceries" and the group
  leaves the page

#### Scenario: Correct a group
- **WHEN** the user picks "Household" in the picker of a group of 3
  guessed as "Groceries"
- **THEN** all three transactions are confirmed "Household" and the group
  leaves the page

#### Scenario: A failed confirm brings the group back
- **WHEN** the user confirms a group and the save fails
- **THEN** the group shows again, unconfirmed, and an error message is
  shown

### Requirement: Correct a single transaction in a group
A Review group SHALL be expandable to list its transactions (date,
account, raw payee, amount and notes), each with its own category picker.
Picking a category there SHALL confirm only that transaction and remove it
from the group. The rest of the group stays unconfirmed.

#### Scenario: Fix one row of a mixed payee
- **WHEN** the user expands a Carrefour Market group of 5 guessed as
  "Groceries" and picks "Household" for one of its rows
- **THEN** that transaction is confirmed "Household", and the group shows
  4 transactions still guessed as "Groceries"

### Requirement: Review works from the keyboard
When the Review page opens with groups, focus SHALL be on the first
group's confirm control. When a group leaves the page, focus SHALL move to
the confirm control of the group that takes its place, or of the previous
group if it was the last. When that group is an AI guess, focus SHALL go to
its category picker instead, so confirming an AI guess always takes a
deliberate step.

#### Scenario: Review a page of groups with Enter
- **WHEN** the Review page shows three history groups and the user presses
  Enter three times
- **THEN** all three groups are confirmed and the page shows its empty
  state

#### Scenario: Focus stops before AI guesses
- **WHEN** the user confirms the last history group and an AI group comes
  next
- **THEN** focus moves to the AI group's category picker, not its confirm
  control, and pressing Enter opens the picker instead of confirming

### Requirement: Navigation shows the review count
The navigation SHALL include a Review entry that shows how many
transactions are unconfirmed, and SHALL hide that count when there are
none. The count SHALL update after the user confirms or corrects guesses,
and when the user navigates between pages.

#### Scenario: Count after an import
- **WHEN** an import commits with 14 guessed transactions and nothing else
  is unconfirmed
- **THEN** the Review entry shows 14

#### Scenario: No count when nothing needs review
- **WHEN** no transaction is unconfirmed
- **THEN** the Review entry shows no count

### Requirement: Categorize uncategorized transactions from the Review page
When the Review page has no groups, it SHALL say so. If there are
uncategorized, non-transfer transactions, it SHALL show how many and offer
to guess their categories across all accounts, from history and, when AI
is configured, from AI. After the run it SHALL report how many got a
category out of how many were tried, split by source when AI contributed,
and list the new groups. When AI is configured and nothing got a category,
it SHALL offer to try again.

#### Scenario: Backfill existing transactions
- **WHEN** nothing is unconfirmed, 40 transactions are uncategorized, 25
  of them from payees with confirmed history, AI isn't configured, and the
  user chooses to guess their categories
- **THEN** those 25 get unconfirmed categories, the page reports 25 of 40,
  and their groups are listed

#### Scenario: Backfill with AI
- **WHEN** AI is configured, 40 transactions are uncategorized, 25 of them
  match history, and the model guesses 10 of the other 15
- **THEN** the page reports 35 of 40, 25 from history and 10 by AI, and
  lists the history groups above the AI groups

#### Scenario: Nothing guessed with AI on
- **WHEN** AI is configured and a backfill of 40 transactions guesses none
- **THEN** the page says no category could be guessed for the 40 and
  offers to try again

#### Scenario: Nothing left to do
- **WHEN** nothing is unconfirmed and every non-transfer transaction has a
  category
- **THEN** the Review page says there's nothing to review and offers no
  backfill

### Requirement: Guess remaining payees with AI
When AI categorization is configured, the categorizer SHALL send the
transactions that history left uncategorized to an AI model after the
history pass, batched by normalized payee and direction rather than one
request per transaction. Each guess SHALL be one of the user's existing
categories or no guess. An AI guess SHALL be unconfirmed, with source "ai"
and the model's short reason.

#### Scenario: A new payee gets an AI guess
- **WHEN** AI is configured, "Bistro Lumiere" has no confirmed history, and
  the model guesses "Eating out" because it reads as a restaurant
- **THEN** the transaction's category is an unconfirmed "Eating out" with
  source "ai" and that short reason

#### Scenario: History runs first
- **WHEN** a payee has confirmed history for "Groceries"
- **THEN** its new transaction gets the history guess and is not sent to
  the AI model

#### Scenario: Repeat payees are sent once
- **WHEN** one categorizer run has four uncategorized outflows from
  "Bistro Lumiere 12", "BISTRO LUMIERE 34" and two other new payees
- **THEN** the AI model is asked about three payees, and both Bistro
  Lumiere transactions get the same guess

#### Scenario: The model may decline
- **WHEN** the model gives no guess for "PAYPAL *X123"
- **THEN** that transaction stays uncategorized

#### Scenario: Only real categories are accepted
- **WHEN** the model's answer names a category the user doesn't have
- **THEN** that transaction stays uncategorized

### Requirement: AI sees only what it needs
For each payee, the system SHALL send the AI model only the payee, its
notes, its amount and direction, plus the names of the user's categories.
It SHALL NOT send account names, balances, dates or other transactions'
data.

#### Scenario: Request contents
- **WHEN** a transaction from "Bistro Lumiere" on account "Checking" dated
  12 Oct for -48.00 with note "team lunch" is sent for a guess
- **THEN** the request contains "Bistro Lumiere", "team lunch", the amount
  and direction and the category names, and neither "Checking" nor the date

### Requirement: AI is optional and never blocks categorizing
Without an API key, or with AI turned off, the categorizer SHALL use
history only and report no error. Imported transactions SHALL be saved
before any guessing starts. The AI step SHALL stop at a fixed deadline. If
it fails, times out or returns an unusable answer, the transactions it
covered SHALL stay uncategorized, history guesses SHALL still be saved, and
the import or backfill SHALL complete.

#### Scenario: No key configured
- **WHEN** no API key is configured and an import commits
- **THEN** history guesses are made, nothing is sent to an AI model, and
  the import succeeds

#### Scenario: The AI request fails
- **WHEN** the AI request times out during an import commit
- **THEN** the import commits, history guesses are saved, and the rest of
  the transactions stay uncategorized

#### Scenario: AI slower than the deadline
- **WHEN** the AI model hasn't answered by the deadline
- **THEN** the guessing stops, the imported transactions are saved, and
  the import completes and reports that AI didn't respond

### Requirement: The AI outcome is reported
After a backfill, the Review page SHALL say when AI didn't respond, when
the API key was rejected (naming the key setting), and how many payees AI
couldn't guess. A successful run with nothing declined SHALL add nothing.

#### Scenario: Declined payees are counted
- **WHEN** a backfill sends 15 payees to AI and the model declines 3
- **THEN** the result says 3 new payees couldn't be guessed

#### Scenario: Rejected key is named
- **WHEN** the API key is rejected during a backfill
- **THEN** the result says AI is not working and to check
  OPENAI_API_KEY, and the history guesses are still listed

### Requirement: AI never guesses a tab
The AI model SHALL NOT be offered tab groups or tabs among the user's
categories, and an AI answer naming one SHALL be ignored. History SHALL
treat tabs like any other category, so a payee confirmed to a tab is
guessed to that tab again.

#### Scenario: Tabs are not sent to the AI
- **WHEN** AI is configured and the user has "Tabs / Jan" and "Groceries"
- **THEN** the request lists "Groceries" and neither "Tabs" nor "Jan"

#### Scenario: History learns a repayer
- **WHEN** a confirmed +30.00 from "JAN PEETERS" is "Tabs / Jan", and a new
  +20.00 from "JAN PEETERS" is imported
- **THEN** the new transaction gets an unconfirmed "Tabs / Jan" guess with
  source "history"

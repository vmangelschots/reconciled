# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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

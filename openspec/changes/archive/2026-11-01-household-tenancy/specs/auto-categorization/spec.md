# Spec Delta

## MODIFIED Requirements

### Requirement: AI is optional and never blocks categorizing
Without an API key, with AI turned off for the instance, or with AI turned off for
the household, the categorizer SHALL use history only and report no error.
Imported transactions SHALL be saved before any guessing starts. The AI step SHALL
stop at a fixed deadline. If it fails, times out or returns an unusable answer, the
transactions it covered SHALL stay uncategorized, history guesses SHALL still be
saved, and the import or backfill SHALL complete.

#### Scenario: No key configured
- **WHEN** no API key is configured and an import commits
- **THEN** history guesses are made, nothing is sent to an AI model, and
  the import succeeds

#### Scenario: Household has AI turned off
- **WHEN** a household has AI turned off and an import commits
- **THEN** history guesses are made, nothing is sent to an AI model, and the
  import succeeds

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
the API key was rejected, and how many payees AI couldn't guess. A rejected key
SHALL be reported as something for the person running the server to fix, without
naming the setting. A successful run with nothing declined SHALL add nothing.

#### Scenario: Declined payees are counted
- **WHEN** a backfill sends 15 payees to AI and the model declines 3
- **THEN** the result says 3 new payees couldn't be guessed

#### Scenario: Rejected key is named
- **WHEN** the API key is rejected during a backfill
- **THEN** the result says "AI isn't working right now. Tell the person who runs
  Reconciled.", and the history guesses are still listed

## ADDED Requirements

### Requirement: Each household chooses AI
Settings SHALL show an AI categorization section when the server has an API key,
with an on/off choice per household, off for new households. Turning it on SHALL
need confirmation, which SHALL say what is sent, to whom and that it applies to
all members. Turning it off SHALL need none. The system SHALL record who turned it
on and when.

#### Scenario: Off by default
- **WHEN** a new household opens Settings
- **THEN** AI categorization is off and nothing is sent to an AI model

#### Scenario: Turning it on
- **WHEN** a member turns AI on
- **THEN** a confirmation says "Reconciled will send payee names, payment notes,
  amounts and your category names to OpenAI, using the account of the person who
  runs this Reconciled. Account names, balances and dates aren't sent. This applies
  to everyone in your household.", and AI stays off until they confirm

#### Scenario: Turning it off
- **WHEN** a member turns AI off
- **THEN** it is off at once, with no confirmation

#### Scenario: The server has no API key
- **WHEN** the server has no API key
- **THEN** Settings shows no AI categorization section

#### Scenario: Review page with AI off
- **WHEN** a household has AI off and the server has an API key
- **THEN** the Review page says "Using your history only. AI suggestions can be
  turned on in Settings."

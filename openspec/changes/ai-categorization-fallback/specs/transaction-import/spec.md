# Spec Delta

## MODIFIED Requirements

### Requirement: Import summary points to the review
After a commit that categorized at least one transaction, the import's
summary SHALL say how many were categorized, split by source when AI
contributed, and link to the Review page. It SHALL also say when AI didn't
respond, when the API key was rejected (naming the key setting), and how
many new payees AI couldn't guess. With nothing categorized and nothing to
report about AI, the summary SHALL show only the created count.

#### Scenario: Summary links to review
- **WHEN** an import commits 20 transactions and 14 of them were
  categorized from history
- **THEN** the summary says 14 were categorized from your history, with a
  link to the Review page

#### Scenario: Summary splits history and AI
- **WHEN** an import commits 20 transactions, 10 categorized from history
  and 4 by AI
- **THEN** the summary says 14 got a category, 10 from your history and 4
  by AI, with a link to the Review page

#### Scenario: AI didn't respond
- **WHEN** an import commits 20 transactions, 10 categorized from history,
  and the AI request timed out
- **THEN** the summary says 10 got a category from your history and that
  AI guessing didn't respond, so it can be retried from Review

#### Scenario: Payees AI couldn't guess
- **WHEN** AI declined 3 of the new payees in an import
- **THEN** the summary says 3 new payees couldn't be guessed

#### Scenario: No line when nothing was categorized
- **WHEN** an import commits 6 transactions, none were categorized, and AI
  isn't configured
- **THEN** the summary shows only the created count

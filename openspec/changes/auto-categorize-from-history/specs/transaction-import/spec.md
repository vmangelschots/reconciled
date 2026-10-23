# Spec Delta

## ADDED Requirements

### Requirement: Committing an import auto-categorizes new transactions
When an import is committed, the system SHALL run the categorizer (see the
`auto-categorization` capability) over the transactions it creates. A line
that confirms a created transfer counterpart SHALL NOT be categorized. The
import's upload, mapping and preview steps SHALL NOT show or ask about
categories.

#### Scenario: Imported repeat payees arrive categorized
- **WHEN** the user commits an import of 20 lines, 14 of them from payees
  with confirmed history
- **THEN** those 14 transactions are created with unconfirmed categories
  and the other 6 are uncategorized

#### Scenario: A transfer confirmation stays a transfer
- **WHEN** a committed line confirms a created transfer counterpart
- **THEN** that transaction keeps its transfer link and gets no category

### Requirement: Import summary points to the review
After a commit that categorized at least one transaction, the import's
summary SHALL say how many were categorized from history and link to the
Review page. With none categorized, the summary SHALL NOT mention it.

#### Scenario: Summary links to review
- **WHEN** an import commits 20 transactions and 14 of them were
  categorized
- **THEN** the summary says 14 were categorized from your history, with a
  link to the Review page

#### Scenario: No line when nothing was categorized
- **WHEN** an import commits 6 transactions and none were categorized
- **THEN** the summary shows only the created count

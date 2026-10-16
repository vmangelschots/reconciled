# Spec Delta

## ADDED Requirements

### Requirement: Ledger shows transaction notes
The transaction ledger SHALL show each transaction's notes in its own
column. A note too long for the column SHALL stay on one line, cut off,
with its full text available on hover. A transaction without notes SHALL
show an empty cell.

#### Scenario: Notes are visible in the ledger
- **WHEN** a transaction has the note "Split with my sister"
- **THEN** its ledger row shows "Split with my sister" in the Notes column

#### Scenario: Long notes are cut off with the full text on hover
- **WHEN** a transaction's note is longer than the Notes column
- **THEN** the row stays one line high, the note is cut off, and hovering
  over it shows the whole note

#### Scenario: No notes
- **WHEN** a transaction has no notes
- **THEN** its Notes cell is empty and shows no hover text

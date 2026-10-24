# Spec Delta

## MODIFIED Requirements

### Requirement: Detect likely duplicate transactions
The system SHALL mark a candidate transaction as a likely duplicate when
an existing transaction on the target account has the same date, the same
amount, and a matching or highly similar description. Parts of a split
transaction SHALL NOT be compared; the split transaction itself SHALL be.
An import SHALL never change a split transaction or its parts.

#### Scenario: Flag a re-imported transaction
- **WHEN** the user re-imports a file containing a transaction that was
  already imported into the target account
- **THEN** the system marks the matching candidate as a likely duplicate
  and excludes it from the default commit selection

#### Scenario: User can override a duplicate flag
- **WHEN** the user explicitly re-includes a candidate marked as a likely
  duplicate
- **THEN** the system commits it as a new transaction when the import is
  confirmed

#### Scenario: A re-imported split transaction is a duplicate
- **WHEN** a -60.00 "Pizzeria" transaction was imported and then split
  into two -30.00 parts, and the same file is imported again
- **THEN** the -60.00 line is marked as a likely duplicate and the split
  is unchanged

#### Scenario: Parts are not duplicates
- **WHEN** an imported file contains a -30.00 "Pizzeria" line on the same
  date as a -30.00 part of a split "Pizzeria" transaction
- **THEN** the line is not marked as a duplicate

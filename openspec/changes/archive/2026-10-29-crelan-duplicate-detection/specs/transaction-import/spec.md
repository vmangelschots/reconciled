# Spec Delta

## MODIFIED Requirements

### Requirement: Detect likely duplicate transactions
The system SHALL mark a candidate transaction as a likely duplicate when
an existing transaction on the candidate's account has the same date,
the same amount, and a matching or highly similar payee. Each
existing transaction SHALL mark at most one candidate of an import, the
first matching one in file order. Parts of a split transaction SHALL NOT
be compared; the split transaction itself SHALL be. An import SHALL
never change a split transaction or its parts.

#### Scenario: Flag a re-imported transaction
- **WHEN** the user re-imports a file containing a transaction that was
  already imported into the target account
- **THEN** the system marks the matching candidate as a likely duplicate
  and excludes it from the default commit selection

#### Scenario: A re-imported Crelan line with a counterparty
- **WHEN** a Crelan line of 1 October 2026, -21.85, with Tegenpartij
  "Ethias" and Mededeling "Verzekeringstaks" was imported, and an export
  containing the same line is imported again
- **THEN** that line is marked as a likely duplicate

#### Scenario: A re-imported CSV line with a mapped payee
- **WHEN** a CSV line of -42.50 with payee "Delhaize" and description
  "Weekly shop" was imported with a payee column mapped, and the same
  file is imported again with the same mapping
- **THEN** that line is marked as a likely duplicate

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

#### Scenario: Two identical payments on one day
- **WHEN** the account has one -7.80 "LAGO Mons" transaction on 11
  October, and an import has two -7.80 "LAGO Mons" lines on 11 October
- **THEN** the first line is marked as a likely duplicate and the second
  is not

#### Scenario: Both identical payments re-imported
- **WHEN** the account already has both -7.80 "LAGO Mons" transactions
  on 11 October, and the same two lines are imported again
- **THEN** both lines are marked as likely duplicates

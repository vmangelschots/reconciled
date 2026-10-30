# Spec Delta

## ADDED Requirements

### Requirement: Opening a ledger on a date range
A link to an account's ledger SHALL be able to set its date filters in the
address, so the ledger opens filtered to those dates. The user SHALL be
able to change or clear them as usual.

#### Scenario: Opened on a month
- **WHEN** the user opens an account's ledger with September 2026 as its
  date range in the address
- **THEN** the ledger lists September 2026, with both date filters filled
  in

#### Scenario: Malformed dates
- **WHEN** a date in the address is malformed
- **THEN** that filter stays empty

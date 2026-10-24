# Spec Delta

## ADDED Requirements

### Requirement: Import starts on the right account
The Import page SHALL preselect the account named in its address, when
it is an active account. Otherwise it SHALL preselect the account last
opened under Transactions, or the first active account. The user SHALL
still be able to pick another account.

#### Scenario: From a stale-import reminder
- **WHEN** the user follows "Crelan: last import 12 days ago" on the
  overview
- **THEN** Import opens with "Crelan" selected

#### Scenario: From the navigation
- **WHEN** the user last opened Revolut's transactions and then opens
  Import from the navigation
- **THEN** Import opens with "Revolut" selected

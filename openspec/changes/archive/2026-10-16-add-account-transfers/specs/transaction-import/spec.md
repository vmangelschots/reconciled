# Spec Delta

## ADDED Requirements

### Requirement: Imported lines confirm created transfer counterparts
When an import's preview contains a line with the same amount as a
transfer counterpart the app created in the target account (not yet
confirmed), dated no more than 5 days from it, the system SHALL show
that line as matching the transfer, selected by default. Committing it
SHALL update the created counterpart with the line's date, payee and
description, mark it as confirmed, and keep the transfer link, instead of
creating a new transaction.

#### Scenario: Bank line replaces a created counterpart
- **WHEN** a transfer created +500.00 on 3 March in "Savings", and the
  user later imports a Savings export containing +500.00 on 4 March
- **THEN** the preview shows that line as matching the transfer from
  "Checking", and committing it leaves one +500.00 in Savings, dated 4
  March, with the bank's description and still linked to "Checking"

#### Scenario: Excluded match changes nothing
- **WHEN** the user unticks a line that matches a created counterpart and
  commits
- **THEN** the created counterpart stays as it was and no new transaction
  is added for that line

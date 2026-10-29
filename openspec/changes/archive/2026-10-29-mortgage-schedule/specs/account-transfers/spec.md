# Spec Delta

## MODIFIED Requirements

### Requirement: Mark a transaction as a transfer
The category picker in the ledger and in the add/edit transaction form
SHALL offer the user's other active accounts as transfer targets, listed
after the categories. Choosing one SHALL make the transaction a transfer
to (for an outflow) or from (for an inflow) that account. A transfer
SHALL have no category. A loan account with a loan setup SHALL NOT be
offered as a transfer target in its paying account, and marking such a
transfer SHALL be rejected, because the schedule already posts the
principal.

#### Scenario: Mark an outflow as a transfer
- **WHEN** the user opens the category picker on a -500.00 transaction in
  "Checking" and chooses "Savings"
- **THEN** the transaction becomes a transfer to "Savings" and its
  category is cleared

#### Scenario: The current and archived accounts are not offered
- **WHEN** the user opens the category picker on a transaction in
  "Checking"
- **THEN** "Checking" itself and archived accounts are not listed as
  transfer targets

#### Scenario: Transfers can be found by typing
- **WHEN** the user types "sav" in the picker
- **THEN** the "Savings" transfer option is listed among the matches

#### Scenario: A scheduled loan is not a transfer target from its payer
- **WHEN** "Mortgage" has a loan setup paid from "Crelan", and the user
  opens the category picker on a transaction in "Crelan"
- **THEN** "Mortgage" is not listed as a transfer target, and marking a
  "Crelan" transaction as a transfer to "Mortgage" through the API is
  rejected

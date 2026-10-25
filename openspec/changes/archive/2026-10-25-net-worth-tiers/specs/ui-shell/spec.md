# Spec Delta

## ADDED Requirements

### Requirement: Everyday total in the sidebar
When the active accounts span more than one tier, the sidebar footer
SHALL show the Everyday tier's total instead of the total of all active
accounts, labelled "Everyday" with the number of everyday accounts.

#### Scenario: Everyday total next to a house
- **WHEN** the active accounts are "Revolut" (checking) 1,200.00,
  "Crelan" (checking) 800.00 and "House" (property) 295,000.00
- **THEN** the sidebar footer shows "Everyday · 2 accounts" with €2,000

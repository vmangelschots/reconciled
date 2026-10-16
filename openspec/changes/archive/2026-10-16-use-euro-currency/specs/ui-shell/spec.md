# Spec Delta

## ADDED Requirements

### Requirement: Amounts are shown in euro
Every monetary amount the app displays SHALL be formatted as euro,
including chart axes, tooltips and table views. Thousands and decimal
separators SHALL follow the browser's language settings.

#### Scenario: Ledger amounts use the euro sign
- **WHEN** a transaction of -42.50 is shown in the ledger
- **THEN** its amount reads as a euro amount (for example "-€42.50", or
  "€ -42,50" with Dutch browser settings), never with a dollar sign

#### Scenario: Chart axes use the euro sign
- **WHEN** the dashboard's in vs out chart labels its axis at 1,500.00
- **THEN** the label is a short euro amount such as "€1.5K"

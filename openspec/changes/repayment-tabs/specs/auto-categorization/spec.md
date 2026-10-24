# Spec Delta

## ADDED Requirements

### Requirement: AI never guesses a tab
The AI model SHALL NOT be offered tab groups or tabs among the user's
categories, and an AI answer naming one SHALL be ignored. History SHALL
treat tabs like any other category, so a payee confirmed to a tab is
guessed to that tab again.

#### Scenario: Tabs are not sent to the AI
- **WHEN** AI is configured and the user has "Tabs / Jan" and "Groceries"
- **THEN** the request lists "Groceries" and neither "Tabs" nor "Jan"

#### Scenario: History learns a repayer
- **WHEN** a confirmed +30.00 from "JAN PEETERS" is "Tabs / Jan", and a new
  +20.00 from "JAN PEETERS" is imported
- **THEN** the new transaction gets an unconfirmed "Tabs / Jan" guess with
  source "history"

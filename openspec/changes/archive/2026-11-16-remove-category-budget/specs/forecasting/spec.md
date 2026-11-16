# Spec Delta

## MODIFIED Requirements

### Requirement: An expected item doesn't double another item
An expected item's category SHALL NOT have a budget of any kind, nor be
covered by a parent's budget, nor be a loan's payment category. Its account
SHALL NOT be in the pot. The system SHALL reject such an item, so nothing
is forecast twice.

#### Scenario: Streaming is a Bills category
- **WHEN** the user saves an expected item recognised by "Streaming"
- **THEN** the system rejects it, saying its budget is already forecast and
  that removing the budget lets it be expected instead

#### Scenario: A transfer within the pot
- **WHEN** the pot is Everyday and the user picks "Revolut" to recognise
  an item by
- **THEN** the system rejects it

# Spec Delta

## MODIFIED Requirements

### Requirement: History learns only from confirmed categories
Unconfirmed categories SHALL NOT count as history when guessing. Parts of
a split transaction SHALL NOT count as history either.

#### Scenario: A guess does not reinforce itself
- **WHEN** a payee's only categorized transaction has the unconfirmed
  category "Dining" and a new transaction from that payee is categorized
- **THEN** the new transaction stays uncategorized

#### Scenario: Parts are not history
- **WHEN** a payee's only categorized history is a "Restaurants" part of a
  split transaction, and a new transaction from that payee is categorized
- **THEN** the new transaction stays uncategorized

### Requirement: The categorizer only fills empty categories
The categorizer SHALL only set a category on a transaction that has none
and is not a transfer. It SHALL never change an existing category,
confirmed or not. It SHALL skip split transactions and their parts, and
the Review page SHALL NOT count them as uncategorized.

#### Scenario: An existing category is kept
- **WHEN** the categorizer runs over a transaction that already has the
  unconfirmed category "Transport"
- **THEN** its category stays "Transport"

#### Scenario: Transfers are skipped
- **WHEN** the categorizer runs over an account containing a transfer to
  "Savings"
- **THEN** the transfer stays a transfer with no category

#### Scenario: Splits are skipped
- **WHEN** the categorizer runs over a split transaction that has a part
  with no category
- **THEN** neither the split transaction nor that part gets a category,
  and neither is counted as uncategorized on the Review page

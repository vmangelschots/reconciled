# Spec Delta

## MODIFIED Requirements

### Requirement: What a backup holds
A backup SHALL hold every account; every transaction, with its splits,
transfer links, value adjustments, notes and category guesses; categories
and tabs; monthly limits; yearly budgets; the budget settings; recurring
transactions; loan setups, with the links between scheduled adjustments
and their installments and payments; the remembered import mappings; and
when each account was last imported into. Rows SHALL keep their ids and
their created and updated times.

#### Scenario: A transfer and a split survive a round trip
- **WHEN** the data holds a transfer from Crelan to Revolut and a
  supermarket line split into Groceries and Household, and the user
  downloads a backup and restores it
- **THEN** the two transfer sides are still linked to each other, and the
  split still has its two parts with their categories

#### Scenario: Last-import dates survive
- **WHEN** Crelan was last imported into on 20 October and a backup made
  after that is restored
- **THEN** the Overview still shows Crelan as last imported on 20 October

#### Scenario: An AI guess stays a guess
- **WHEN** a transaction has an unconfirmed AI category with its reason, and
  a backup of it is restored
- **THEN** the transaction is still waiting in Review with the same guess
  and reason

#### Scenario: A loan schedule survives
- **WHEN** "Mortgage" has a loan setup and a scheduled adjustment matched
  to a payment in Crelan, and a backup of it is restored
- **THEN** the setup has the same terms, the adjustment is still that
  installment's and linked to the same payment, and no adjustment is
  posted twice

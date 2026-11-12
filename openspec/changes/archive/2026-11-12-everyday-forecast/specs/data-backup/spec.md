## MODIFIED Requirements

### Requirement: What a backup holds
A backup SHALL hold every account; every transaction, with its splits,
transfer links, value adjustments, notes and category guesses; categories
and tabs; monthly limits; yearly budgets; bills with the months they
count in; the budget settings; expected items; loan setups and their
balance corrections, with the links
between scheduled adjustments and their installments, corrections and
payments; the remembered import mappings; when each account was last
imported into; and bank account links with their seen bank lines. Rows SHALL keep
their created and updated times and every link between them, but restored rows
SHALL get new ids.

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

#### Scenario: A correction survives
- **WHEN** "Mortgage" has a balance correction with a chosen payment, and
  a backup of it is restored
- **THEN** the correction has the same date, amount and payment, its
  adjustment is still linked to it, and the schedule is the same as
  before

#### Scenario: A deleted line stays deleted after a restore
- **WHEN** a synced line was deleted before a backup was made, and that
  backup is restored and the bank reports the line again
- **THEN** it is not created again

#### Scenario: Remembered account mappings survive
- **WHEN** an import mapping sends a Revolut product to "Revolut Pockets", and a
  backup of it is restored
- **THEN** the mapping still points at the restored "Revolut Pockets"

#### Scenario: Bills survive
- **WHEN** "Streaming" is a Bills category with Netflix 17.99 on the 5th,
  and a backup of it is restored
- **THEN** "Streaming" is still a Bills category with Netflix 17.99 on the
  5th, counting from the same month

#### Scenario: A backup from before bills
- **WHEN** a backup made before bills existed is restored
- **THEN** it restores, with no bills

#### Scenario: Bill history survives
- **WHEN** Netflix was 17.99 until October and is 19.99 from November, and
  a backup of it is restored
- **THEN** October still expects 17.99 and November 19.99

#### Scenario: Expected items survive
- **WHEN** "Salary" is expected in, 4,500.00 on the 25th, recognised by
  "Salary", and a backup of it is restored
- **THEN** "Salary" is still expected the same way

#### Scenario: A backup with recurring transactions
- **WHEN** a backup made before expected items holds a monthly recurring
  "Salary" of +4,500.00 starting 25 March in category "Salary", a weekly
  one, and a monthly one without a category
- **THEN** it restores with "Salary" as an expected item in, 4,500.00 on
  the 25th, recognised by "Salary", and without the other two

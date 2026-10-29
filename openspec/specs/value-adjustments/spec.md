# Value Adjustments Specification

## Purpose

Lets the user hold accounts whose value changes without bank
transactions (investments, property, loans) at their real value, by
recording dated values as adjustments that change the balance but are
never income or spending.

## Requirements

### Requirement: Set an account's value
On an investment, property or loan account, the system SHALL let the
user set the account's value on a date. The system SHALL record a value
adjustment dated that day that holds the value set, and whose amount is
the difference from the account's balance at the end of that date
without it. Setting a value on a date that already has an adjustment
SHALL replace it, unless that adjustment was posted by a loan schedule,
in which case setting the value SHALL be rejected. Other account types,
and a loan account with a loan setup, SHALL NOT offer this.

#### Scenario: Revalue the house
- **WHEN** "House" (property) has a balance of 295,000.00 and the user
  sets its value to 310,000.00 on 1 October
- **THEN** a value adjustment of +15,000.00 dated 1 October, set to
  310,000.00, is recorded and the balance becomes 310,000.00

#### Scenario: A value on an earlier date
- **WHEN** "Funds" (investment) had 14,000.00 at the end of 30 September
  and a +500.00 deposit on 3 October, and the user sets its value to
  14,200.00 on 30 September
- **THEN** a +200.00 adjustment dated 30 September is recorded and the
  current balance becomes 14,700.00

#### Scenario: Same day replaces
- **WHEN** "House" has an adjustment set to 310,000.00 on 1 October and
  the user sets its value to 305,000.00 on 1 October
- **THEN** that adjustment is replaced by one set to 305,000.00, and the
  ledger has one adjustment on 1 October

#### Scenario: Same value still records the value
- **WHEN** the user sets "House" to the balance it already has on that
  date
- **THEN** an adjustment of 0.00 set to that value is recorded

#### Scenario: Not offered on everyday or savings accounts
- **WHEN** the user opens the ledger of a checking or savings account
- **THEN** there is no option to set its value

#### Scenario: Not offered on a loan with a schedule
- **WHEN** the user opens the ledger of "Mortgage", which has a loan
  setup
- **THEN** the header offers "Schedule" and no "Set value"

#### Scenario: A scheduled adjustment is not replaced
- **WHEN** "Mortgage" has an adjustment posted by its loan schedule on 4
  November, and the user sets its value on 4 November
- **THEN** the request is rejected with a message, and the scheduled
  adjustment is unchanged

### Requirement: A set value holds on its date
Each adjustment SHALL keep the account at its set value at the end of
its date. When anything dated on or before it changes (an earlier
adjustment, a transaction added, edited or deleted, or the starting
balance), the system SHALL recompute its amount so the balance on its
date stays the value set.

#### Scenario: Back-dating keeps a later value
- **WHEN** "House" was 295,000.00 with an adjustment set to 310,000.00 on
  15 October, and the user sets its value to 300,000.00 on 30 September
- **THEN** the 30 September adjustment is +5,000.00, the 15 October one
  becomes +10,000.00, and the balance stays 310,000.00

#### Scenario: An earlier transaction arrives
- **WHEN** "Funds" has an adjustment set to 14,700.00 on 15 October, and
  a +500.00 deposit dated 10 October is imported afterwards
- **THEN** the adjustment's amount drops by 500.00 and the balance on 15
  October stays 14,700.00

#### Scenario: Later transactions still count
- **WHEN** "Funds" has an adjustment set to 14,700.00 on 15 October, and
  a +300.00 deposit dated 20 October is added
- **THEN** the adjustment is unchanged and the balance becomes 15,000.00

### Requirement: Loan values are entered as what is owed
For a loan account, setting its value SHALL ask for the amount still
owed as a positive number, and SHALL record it as a negative value. The
ledger and balances SHALL show the negative value.

#### Scenario: Update the mortgage balance
- **WHEN** "Mortgage" (loan) has a balance of -188,000.00 and the user
  enters 187,340.00 as still owed
- **THEN** an adjustment of +660.00 set to -187,340.00 is recorded and
  the balance becomes -187,340.00

### Requirement: Value adjustments in the ledger
A value adjustment SHALL show in its account's ledger as "Value
adjustment" with the value it was set to, and SHALL count toward the
balance like any transaction. Its amount SHALL show in a neutral colour.
It SHALL have no category, edit, split or transfer control. The user
SHALL be able to delete it, unless it was posted by a loan schedule: such
an adjustment SHALL show "Installment N of M", or "Schedule start" for
the line-up, in place of its category, linking to the loan's schedule,
and SHALL have no delete control.

#### Scenario: Shown in the ledger
- **WHEN** "House" has a +15,000.00 adjustment set to 310,000.00 on 1
  October
- **THEN** its ledger lists a "Value adjustment" row on 1 October
  showing "Set to €310,000" and +15,000.00, with no category control

#### Scenario: Delete the latest adjustment
- **WHEN** "House" was 295,000.00 and its only adjustment, set to
  310,000.00, is deleted
- **THEN** the balance of "House" goes back to 295,000.00

#### Scenario: Delete an earlier adjustment
- **WHEN** "House" has adjustments set to 300,000.00 on 30 September and
  310,000.00 on 15 October, and the 30 September one is deleted
- **THEN** the 15 October adjustment is recomputed and the balance stays
  310,000.00

#### Scenario: Type changed away
- **WHEN** "Funds" has adjustments and its type is changed to "savings"
- **THEN** the adjustments stay in the ledger, keep their values and can
  still be deleted, but no new value can be set

#### Scenario: A scheduled adjustment in the ledger
- **WHEN** "Mortgage" has the adjustment posted for installment 24 of
  300
- **THEN** its row reads "Value adjustment" and "Set to -€187,340",
  with "Installment 24 of 300" in place of its category, opening the
  "Mortgage" schedule, and no delete control; deleting it through the
  API is rejected

#### Scenario: The line-up in the ledger
- **WHEN** "Mortgage" has the adjustment posted when its loan was set up
- **THEN** its row shows "Schedule start" in place of its category,
  with no delete control

### Requirement: Value adjustments are neither income nor spending
A value adjustment SHALL NOT count as income, spending, uncategorized
spend or a transfer anywhere: not in budgets, the dashboard, the
Overview's month change or recent transactions, and not in the Review
page or its uncategorized count. Auto-categorization SHALL never guess a
category for it, and import duplicate detection SHALL never match it.

#### Scenario: Not in the month's change
- **WHEN** in October the only activity is a +15,000.00 adjustment on
  "House"
- **THEN** the Overview's month change, the dashboard's money in and the
  budget's uncategorized spend for October are all zero

#### Scenario: Not waiting for review
- **WHEN** an adjustment is recorded
- **THEN** it is not counted as uncategorized on the Review page and no
  category is guessed for it

#### Scenario: Not matched by an import
- **WHEN** an imported line has the same date and amount as an
  adjustment in that account
- **THEN** the line is not flagged as a likely duplicate of the
  adjustment

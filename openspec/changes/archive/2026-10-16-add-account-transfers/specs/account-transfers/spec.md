# Spec Delta

## Purpose

Lets the user record money moving between two of their own accounts as a
linked pair of transactions, so it counts toward both balances but never
as spending or income.

## ADDED Requirements

### Requirement: Mark a transaction as a transfer
The category picker in the ledger and in the add/edit transaction form
SHALL offer the user's other active accounts as transfer targets, listed
after the categories. Choosing one SHALL make the transaction a transfer
to (for an outflow) or from (for an inflow) that account. A transfer
SHALL have no category.

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

### Requirement: Link to a matching transaction
When a transaction is marked as a transfer, the system SHALL look in the
target account for an unlinked transaction with the opposite amount,
dated no more than 5 days before or after it. If there is one, the system
SHALL link the two. If there are several, it SHALL pick the one with the
closest date. Each side SHALL keep its own date. The matched transaction
SHALL lose its category.

#### Scenario: Link across different booking dates
- **WHEN** -500.00 on 3 March in "Checking" is marked as a transfer to
  "Savings", which has an unlinked +500.00 on 5 March
- **THEN** the two are linked, dated 3 and 5 March respectively

#### Scenario: Closest date wins
- **WHEN** "Savings" has unlinked +500.00 transactions on 1 March and 4
  March, and -500.00 on 3 March in "Checking" is marked as a transfer to
  "Savings"
- **THEN** it is linked to the 4 March transaction

#### Scenario: Too far apart does not match
- **WHEN** the only +500.00 in "Savings" is dated 9 March, and -500.00 on
  3 March is marked as a transfer to "Savings"
- **THEN** it is not linked to the 9 March transaction

### Requirement: Create the counterpart when nothing matches
If no transaction in the target account matches, the system SHALL create
the opposite transaction there, on the same date, linked to the original.
The created transaction SHALL be marked as created by a transfer until an
import confirms it.

#### Scenario: Counterpart is created
- **WHEN** -500.00 on 3 March in "Checking" is marked as a transfer to
  "Savings", and "Savings" has no matching transaction
- **THEN** "Savings" gets a linked +500.00 transaction on 3 March, and
  both account balances reflect the transfer

### Requirement: Show transfers in the ledger
The ledger SHALL show a transfer in place of its category as "→ <account>"
for an outflow or "← <account>" for an inflow, naming the other account.

#### Scenario: Both sides show their direction
- **WHEN** -500.00 in "Checking" is linked to +500.00 in "Savings"
- **THEN** the Checking ledger shows "→ Savings" and the Savings ledger
  shows "← Checking"

### Requirement: Unlink a transfer
Choosing a category, or the "no category" option, for a transfer SHALL
unlink it, as SHALL choosing a different account (which then links to
that account instead). After unlinking, the other side SHALL become a
normal uncategorized transaction, unless it was created by the transfer
and never confirmed by an import, in which case it SHALL be deleted.

#### Scenario: Picking a category unlinks
- **WHEN** the user picks "Groceries" for a transfer whose counterpart was
  imported from the bank
- **THEN** the transaction gets "Groceries", and the counterpart stays as
  an uncategorized transaction with no link

#### Scenario: An unconfirmed created counterpart is removed
- **WHEN** the user unlinks a transfer whose counterpart the app created
  and no import has confirmed
- **THEN** the created counterpart is deleted

### Requirement: Deleting one side of a transfer
Deleting a transaction that is part of a transfer SHALL unlink its
counterpart, which SHALL become a normal uncategorized transaction, or be
deleted too if it was created by the transfer and never confirmed by an
import.

#### Scenario: Delete one side
- **WHEN** the user deletes the -500.00 in "Checking" linked to an
  imported +500.00 in "Savings"
- **THEN** the +500.00 remains in "Savings", unlinked and uncategorized

### Requirement: Edits reach a created counterpart
Changing the amount or date of a transfer SHALL apply the same change
(with the opposite amount) to its counterpart if that counterpart was
created by the transfer and not yet confirmed by an import. Two linked
transactions that both came from the bank or were entered manually SHALL
be edited independently.

#### Scenario: Amount change follows to a created counterpart
- **WHEN** a transfer of -500.00 with a created counterpart is edited to
  -550.00
- **THEN** the counterpart becomes +550.00

#### Scenario: Confirmed sides are independent
- **WHEN** the date of one side of a transfer is changed, and both sides
  came from bank imports
- **THEN** the other side's date is unchanged

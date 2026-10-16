# Spec Delta

## MODIFIED Requirements

### Requirement: Monthly money in and money out
For each of the last 12 calendar months, ending with the current one, the
system SHALL report money in (the sum of positive transaction amounts) and
money out (the sum of negative amounts, as a positive figure). Only
non-archived accounts count, and transfers between the user's accounts
SHALL count toward neither. A month with no transactions SHALL report
zero for both.

#### Scenario: Income and spending are totalled separately
- **WHEN** an active account has +2,000.00 and -1,500.00 in March, and
  -300.00 more in March on a second active account
- **THEN** March reports money in 2,000.00 and money out 1,800.00

#### Scenario: Archived accounts are excluded
- **WHEN** an archived account has transactions in a month
- **THEN** they count toward neither money in nor money out

#### Scenario: Empty months are zero
- **WHEN** there are no transactions in one of the 12 months
- **THEN** that month is still listed, with zero in and zero out

#### Scenario: Transfers are excluded
- **WHEN** in March -500.00 in "Checking" is a transfer to "Savings"
  (+500.00), and there are no other transactions
- **THEN** March reports zero money in and zero money out

### Requirement: Category spending for a month
For a chosen month, the system SHALL report each category's spending:
the net outflow of its transactions in active accounts, so refunds reduce
it. A top-level category's figure SHALL include its subcategories. A
category with no net outflow SHALL be left out. Spending without a
category SHALL be reported as "Uncategorized", counting outflows only and
leaving out transfers between the user's accounts.

#### Scenario: Subcategories roll into their parent
- **WHEN** in March "Groceries" has -50.00 directly and its subcategory
  "Supermarket" has -200.00
- **THEN** "Groceries" reports 250.00, of which "Supermarket" is 200.00

#### Scenario: Refunds reduce spending
- **WHEN** in March "Clothing" has -80.00 and a refund of +30.00
- **THEN** "Clothing" reports 50.00

#### Scenario: Uncategorized ignores income
- **WHEN** in March uncategorized transactions are -40.00 and a salary of
  +2,000.00
- **THEN** "Uncategorized" reports 40.00

#### Scenario: Uncategorized ignores transfers
- **WHEN** in March there is -40.00 uncategorized spending and a -500.00
  transfer to "Savings"
- **THEN** "Uncategorized" reports 40.00

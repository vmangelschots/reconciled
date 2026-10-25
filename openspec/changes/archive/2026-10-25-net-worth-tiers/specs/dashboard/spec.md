# Spec Delta

## MODIFIED Requirements

### Requirement: Monthly money in and money out
For each of the 12 calendar months ending with a chosen month (by
default the current one), the system SHALL report money in (the sum of
positive amounts) and money out (the sum of negative amounts, as a
positive figure). Only non-archived accounts count; transfers between
the user's accounts and value adjustments count toward neither. An
empty month reports zero for both. A split transaction counts through
its parts, so a part that is a transfer counts toward neither.

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

#### Scenario: A split counts once, without its transfer part
- **WHEN** March's only transaction in "Checking" is -60.00, split into
  -30.00 "Restaurants" and -30.00 as a transfer to "Savings"
- **THEN** March reports money out 30.00 and zero money in

#### Scenario: Value adjustments are excluded
- **WHEN** March's only entry is a -8,000.00 value adjustment on "Funds"
- **THEN** March reports zero money in and zero money out

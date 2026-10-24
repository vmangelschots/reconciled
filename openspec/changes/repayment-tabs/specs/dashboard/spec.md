# Spec Delta

## ADDED Requirements

### Requirement: Tab rows are neither income nor spending
Transactions and split parts in a tab SHALL count toward neither money
in, money out nor category spending, the same way transfers don't. The
in vs out chart SHALL say "Excludes transfers and tabs".

#### Scenario: Half a dinner to a tab
- **WHEN** March's only transaction is -60.00, split into -30.00
  "Restaurants" and -30.00 "Tabs / Jan"
- **THEN** March reports money out 30.00 and "Restaurants" 30.00, and
  "Tabs" is not listed in category spending

#### Scenario: A repayment is not income
- **WHEN** in March +30.00 from "JAN PEETERS" is categorized "Tabs / Jan"
  and there are no other transactions
- **THEN** March reports zero money in

#### Scenario: The chart says what it leaves out
- **WHEN** the user opens the dashboard
- **THEN** the in vs out chart shows "Excludes transfers and tabs"

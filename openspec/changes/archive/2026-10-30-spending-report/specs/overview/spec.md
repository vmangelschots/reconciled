# Spec Delta

## MODIFIED Requirements

### Requirement: Overview layout
On wide screens the overview SHALL show balance, budget and accounts as
a row of tiles. Below them, a main column SHALL hold the everyday money
chart, the category chart and then recent transactions, and a side column
SHALL hold needs attention, open tabs and then the net worth chart, so a
missing tabs panel leaves no gap.

#### Scenario: No tabs, no gap
- **WHEN** no tab exists on a wide screen
- **THEN** the side column holds needs attention and then net worth, and
  the main column is unaffected

### Requirement: Overview on a phone
On a phone the overview SHALL be one column in this order: balance,
budget, accounts, needs attention, open tabs, everyday money, category
chart, recent transactions, net worth.

#### Scenario: Phone order
- **WHEN** the overview is shown 390px wide
- **THEN** the panels follow the phone order with no sideways scrolling,
  and the last panel isn't hidden behind the tab bar

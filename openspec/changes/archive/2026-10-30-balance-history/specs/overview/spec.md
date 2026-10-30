# Spec Delta

## ADDED Requirements

### Requirement: Net worth change in the Balance tile
When the tile lists Net worth, it SHALL show below the figure the chosen
month's change: net worth at that month's end, or today, minus net worth
at the previous month's end, in history's figures. A rise SHALL use "+"
and the positive colour; a fall the secondary colour, never critical. It
SHALL be hidden at zero or without an earlier month end.

#### Scenario: A rise this month
- **WHEN** net worth rose by 1,240.00 since the end of last month
- **THEN** the row shows "+€1,240 this month" under the figure

#### Scenario: A past month
- **WHEN** the user switches to September and net worth fell 300.00 in it
- **THEN** the row shows "-€300 in September" in the secondary colour

#### Scenario: A real jump shows
- **WHEN** a house worth 295,000.00 got its first value this month, with
  no matching loan or payment
- **THEN** the row shows "+€295,000 this month"

#### Scenario: First month
- **WHEN** the history has no earlier month end
- **THEN** no change is shown

## MODIFIED Requirements

### Requirement: Overview layout
On wide screens the overview SHALL show balance, budget and accounts as
a row of tiles. Below them, a main column SHALL hold the everyday money
chart, the category chart and then recent transactions, and a side column
SHALL hold needs attention, open tabs and then the net worth chart, so a
missing tabs panel leaves no gap. The 12-month in vs out chart SHALL span
the full width at the bottom.

#### Scenario: No tabs, no gap
- **WHEN** no tab exists on a wide screen
- **THEN** the side column holds needs attention and then net worth, and
  the main column is unaffected

### Requirement: Overview on a phone
On a phone the overview SHALL be one column in this order: balance,
budget, accounts, needs attention, open tabs, everyday money, category
chart, recent transactions, net worth, in vs out.

#### Scenario: Phone order
- **WHEN** the overview is shown 390px wide
- **THEN** the panels follow the phone order with no sideways scrolling,
  and the last panel isn't hidden behind the tab bar

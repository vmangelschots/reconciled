## ADDED Requirements

### Requirement: Net worth projection
The system SHALL report, next to net worth history, the net worth forecast
(see the `forecasting` capability) for the 12 months after the current
one, at each month's end. With nothing forecast, it SHALL report no
projection.

#### Scenario: A year ahead
- **WHEN** it is November 2026 and bills, a loan and a salary are set up
- **THEN** the projection reports December 2026 through November 2027

#### Scenario: Nothing forecast
- **WHEN** there are no bills, loans, budgets or expected items
- **THEN** no projection is reported

### Requirement: Net worth projection on the chart
The Overview's net worth chart SHALL continue its line from the current
month as a dashed line without fill over the projection, inside a Y axis
that spans both. The range buttons SHALL choose how much history shows,
and the projection SHALL always follow it.

#### Scenario: History and a year ahead
- **WHEN** net worth history covers 18 months and a projection is reported
- **THEN** the chart shows the history as a solid line and the next 12
  months as a dashed line after it

#### Scenario: The 1Y range
- **WHEN** the user chooses 1Y
- **THEN** the chart shows the last 12 months of history, then the dashed
  projection

## MODIFIED Requirements

### Requirement: Net worth tooltip
Hovering a month SHALL show, in whole euros, the month, the total, each
tier with a non-zero balance in tier order, and the change from the month
before. A projected month SHALL say "Projected" and show only the total
and the change. In the side column the tooltip SHALL open over the main
column and leave the hovered point visible.

#### Scenario: Hover October
- **WHEN** the user hovers October 2026
- **THEN** the tooltip lists "October 2026", net worth, the non-zero tiers
  and the change, with Loans as a minus amount in the normal text colour

#### Scenario: Hover a projected month
- **WHEN** the user hovers March 2027 on the dashed line
- **THEN** the tooltip shows "March 2027 · Projected", net worth and the
  change from February, without tiers

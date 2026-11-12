## MODIFIED Requirements

### Requirement: Everyday money projection
For the current month, the system SHALL project the Everyday money for the
30 days after today, using the Everyday forecast (see the `forecasting`
capability), and report the projection's lowest balance and its date. For
any other month there SHALL be no projection.

#### Scenario: Two accounts add up
- **WHEN** "Revolut" and "Crelan" are both Everyday accounts and bills are
  due in the next 30 days
- **THEN** each projected day is the Everyday forecast of both accounts
  together, the same as on the Forecast page over 30 days

#### Scenario: Past month has no projection
- **WHEN** the chosen month is before the current one
- **THEN** no projection is reported

### Requirement: Projection on the chart
The projection SHALL continue the line from today as a dashed, stepped
line without fill, with a "Today" marker, a dot and today's value, inside
a Y axis that spans it. A tooltip over it SHALL say "Projected". A past
month SHALL show neither and SHALL be captioned "To 30 Sep".

#### Scenario: Current month
- **WHEN** the current month is shown and a bill is due in 5 days
- **THEN** the dashed line steps down in 5 days

#### Scenario: Past month
- **WHEN** the user switches to September 2026
- **THEN** the chart shows no dashed line or Today marker, and says
  "To 30 Sep"

### Requirement: Lowest projected point
The chart SHALL label the projection's lowest point ("Low €312 · 27 Nov")
only when it falls after today and below today's balance. When income is
expected (see the `forecasting` capability), a projection that goes below
zero SHALL show that part and the label in the critical colour.

#### Scenario: A low ahead
- **WHEN** the balance is 1,840.00 and falls to 312.00 on 27 November
- **THEN** the chart says "Low €312 · 27 Nov"

#### Scenario: Only rising
- **WHEN** the projection never falls below today's balance
- **THEN** no low is labelled

#### Scenario: Running short
- **WHEN** income is expected and the projection reaches -150.00
- **THEN** the part below zero and its label use the critical colour

## ADDED Requirements

### Requirement: Projection with nothing expected
When nothing is forecast in the 30 days after today, the line SHALL stop
at today and the chart SHALL offer "Add expected income", opening Forecast
over 30 days.

#### Scenario: Nothing expected
- **WHEN** there are no bills, budgets, loan installments from an Everyday
  account or expected items in the next 30 days
- **THEN** there is no dashed line, and an "Add expected income" link
  opens /forecast?days=30

### Requirement: Projection without expected income
When the projection is shown and no income is expected, the chart SHALL
say "No income expected" as a muted link to Forecast over 30 days, not in
the warning colour. The part below zero and the low label SHALL NOT use
the critical colour.

#### Scenario: Bills but no salary
- **WHEN** bills are due in the next 30 days, no income is expected, and
  the projection falls below zero
- **THEN** the chart says "No income expected", linking to
  /forecast?days=30, and shows the low point without the critical colour

## REMOVED Requirements

### Requirement: Projection without recurring transactions
**Reason**: Recurring transactions are replaced by expected items. Bills,
budgets and installments now come in by themselves.
**Migration**: See "Projection with nothing expected".

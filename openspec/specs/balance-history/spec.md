# balance-history Specification

## Purpose

Shows how the user's everyday money and net worth moved over time, and
where everyday money is heading, from the ledger as it stands.

## Requirements

### Requirement: Balance on a past day
The system SHALL compute an account's balance at the end of a day as its
starting balance plus all its rows up to and including that day, value
adjustments and transfers included. A split transaction SHALL count once,
at its own amount.

#### Scenario: A value adjustment moves the balance
- **WHEN** "House" starts at 0.00 and has a value adjustment to 295,000.00
  on 10 October
- **THEN** its balance is 0.00 on 9 October and 295,000.00 on 10 October

#### Scenario: A split counts once
- **WHEN** "Checking" has a -60.00 transaction split into two parts
- **THEN** its balance falls by 60.00 that day

### Requirement: Archived accounts stay in history
Past balances SHALL include archived accounts, under the tier their type
gives them.

#### Scenario: A closed savings account
- **WHEN** "Old savings" held 5,000.00 until it was emptied in June and
  then archived
- **THEN** net worth history still counts the 5,000.00 before June

### Requirement: Everyday money series
The system SHALL report the end-of-day balance of the Everyday tier for
each day of the 90 days ending at the chosen month's last day, or today
for the current month. With one tier in use the series SHALL cover that
tier. Days before the first row of those accounts SHALL NOT be reported.
A malformed month SHALL be rejected.

#### Scenario: Current month
- **WHEN** the chosen month is the current one
- **THEN** the series ends today

#### Scenario: Past month
- **WHEN** the chosen month is September 2026 and it is October
- **THEN** the series ends on 30 September

#### Scenario: Short history
- **WHEN** the first Everyday row is 20 days ago
- **THEN** the series has 21 points, and is not padded

#### Scenario: One tier that isn't Everyday
- **WHEN** the only active accounts are savings accounts
- **THEN** the series covers the Savings tier, matching the tile's
  "Balance"

### Requirement: Everyday money projection
For the current month, the system SHALL project the active Everyday
accounts' total for the 30 days after today, using the forecast of each
account, and report the projection's lowest balance and its date. For any
other month there SHALL be no projection.

#### Scenario: Two accounts add up
- **WHEN** "Revolut" and "Crelan" both have recurring transactions
- **THEN** each projected day is the sum of both accounts' forecasts

#### Scenario: Past month has no projection
- **WHEN** the chosen month is before the current one
- **THEN** no projection is reported

### Requirement: Everyday money chart
The Overview SHALL show the Everyday series as a line with a light flat
fill and a Y axis that always includes zero, titled like the Balance tile
("Everyday", or "Balance" with one tier). Hovering SHALL show the date,
the balance and the change from the day before, in whole euros. A table
view SHALL list the same figures, marking projected days.

#### Scenario: Hover a day
- **WHEN** the user hovers 14 October
- **THEN** a tooltip shows "Wed 14 Oct", that day's balance and its change

#### Scenario: Today is an actual
- **WHEN** the user hovers today
- **THEN** the tooltip shows the actual balance and doesn't say "Projected"

#### Scenario: Table view
- **WHEN** the user switches the chart to its table view
- **THEN** a table lists every day with its balance and change, and
  projected days are marked

### Requirement: Projection on the chart
The projection SHALL continue the line from today as a dashed, stepped
line without fill, with a "Today" marker, a dot and today's value, inside
a Y axis that spans it. A tooltip over it SHALL say "Projected". A past
month SHALL show neither and SHALL be captioned "To 30 Sep".

#### Scenario: Current month
- **WHEN** the current month is shown and a recurring bill is due in 5 days
- **THEN** the dashed line steps down in 5 days

#### Scenario: Past month
- **WHEN** the user switches to September 2026
- **THEN** the chart shows no dashed line or Today marker, and says
  "To 30 Sep"

### Requirement: Lowest projected point
The chart SHALL label the projection's lowest point ("Low €312 · 27 Nov")
only when it falls after today and below today's balance. A projection
that goes below zero SHALL show that part and the label in the critical
colour.

#### Scenario: A low ahead
- **WHEN** the balance is 1,840.00 and falls to 312.00 on 27 November
- **THEN** the chart says "Low €312 · 27 Nov"

#### Scenario: Only rising
- **WHEN** the projection never falls below today's balance
- **THEN** no low is labelled

#### Scenario: Running short
- **WHEN** the projection reaches -150.00
- **THEN** the part below zero and its label use the critical colour

### Requirement: Projection without recurring transactions
When nothing is scheduled in the 30 days after today, the line SHALL stop
at today and the chart SHALL link to Forecast.

#### Scenario: Nothing scheduled
- **WHEN** no Everyday account has a recurring transaction or a loan
  installment in the next 30 days
- **THEN** there is no dashed line, and a "Set up recurring transactions"
  link opens Forecast

### Requirement: Projection warns about stale imports
When a projection is shown and an active Everyday account was last
imported more than 7 days ago or never, the chart SHALL say so in the
warning colour, since the projection starts from its balance. It SHALL
use the wording of the Overview's stale-import line.

#### Scenario: Stale account
- **WHEN** "Crelan" was last imported 12 days ago
- **THEN** the chart says "Crelan: last import 12 days ago"

#### Scenario: Several stale accounts
- **WHEN** two Everyday accounts are stale
- **THEN** the chart says "2 accounts not imported this week"

#### Scenario: No projection
- **WHEN** the chosen month is in the past
- **THEN** no stale note is shown

### Requirement: Net worth series
The system SHALL report, for each month from the first row of any account
to the current month, the balance of all accounts at that month's end,
per tier and in total. The current month SHALL report today's balance.

#### Scenario: Tiers add up
- **WHEN** October ends with Everyday 4,100.00, Property 530,000.00 and
  Loans -179,800.00
- **THEN** October reports those tiers and a total of 354,300.00

#### Scenario: A purchase with a loan is neutral
- **WHEN** a 300,000.00 house value and a -300,000.00 loan are both dated
  in the same month
- **THEN** that month's total does not change because of them

#### Scenario: An asset shows when its value is first set
- **WHEN** "House" starts at 0.00 and its first value of 295,000.00 is
  dated 10 October, with no matching loan or payment
- **THEN** net worth rises by 295,000.00 in October, and months before it
  do not count the house

### Requirement: Net worth chart
The Overview SHALL show the net worth series as a line without fill, whose
Y axis scales to the shown data and marks zero when in range. Debt and a
negative net worth SHALL use the normal colours. The chart SHALL NOT
follow the month switcher, but SHALL mark the chosen month.

#### Scenario: Follows nothing, marks the month
- **WHEN** the user switches the Overview to June 2026
- **THEN** the line is unchanged and June 2026 is marked on it

#### Scenario: Negative net worth
- **WHEN** net worth is below zero
- **THEN** the line keeps its colour and the zero line is shown

### Requirement: Net worth tooltip
Hovering a month SHALL show, in whole euros, the month, the total, each
tier with a non-zero balance in tier order, and the change from the month
before. In the side column the tooltip SHALL open over the main column
and leave the hovered point visible.

#### Scenario: Hover October
- **WHEN** the user hovers October 2026
- **THEN** the tooltip lists "October 2026", net worth, the non-zero tiers
  and the change, with Loans as a minus amount in the normal text colour

### Requirement: Net worth ranges
The chart SHALL offer 1Y, 5Y and All, opening on All. A range that would
show nothing more than a shorter one SHALL be hidden.

#### Scenario: Eighteen months of history
- **WHEN** the history covers 18 months
- **THEN** 1Y and All are offered, and 5Y is not

#### Scenario: One year of history or less
- **WHEN** the history covers 12 months or fewer
- **THEN** no range buttons are shown

### Requirement: Charts with little history
A chart without enough history SHALL say so in its own area instead of
drawing a history line.

#### Scenario: Under three days of everyday history
- **WHEN** the Everyday series has fewer than 3 points
- **THEN** the chart says "History starts 28 Oct", with any projection
  still shown below it

#### Scenario: No everyday history
- **WHEN** the Everyday series has no points, as for a month before the
  first row
- **THEN** the chart says "No history yet"

#### Scenario: No earlier month end
- **WHEN** the net worth series has only the current month
- **THEN** the chart says it appears after the first month end

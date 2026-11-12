## ADDED Requirements

### Requirement: A net worth forecast
The system SHALL forecast net worth month by month over 1, 3 or 5 years.
It SHALL start from today's net worth, as net worth history reports it
for the current month, and report net worth at the end of each month. The current month SHALL know what already happened, as in the
Everyday forecast.

#### Scenario: Three years ahead
- **WHEN** net worth is 77,000.00 on 12 November and the user asks for 3
  years
- **THEN** the forecast reports November at today's 77,000.00, then the end
  of each of the next 36 months, the rest of November counting towards
  December

#### Scenario: A bill already paid
- **WHEN** Netflix was paid on 6 November
- **THEN** November's net worth doesn't take it again, and December's
  does

### Requirement: What counts in net worth
In the net worth forecast:
- bills, budgets, targets and expected items with a category SHALL count
  as in the Everyday forecast;
- an expected item recognised by an account SHALL count as nothing, since
  the money moves between the user's own accounts;
- investments and property SHALL keep today's value.

#### Scenario: Saving every month
- **WHEN** "Savings" is out 500.00 a month, recognised by "Spaarrekening"
- **THEN** it doesn't change the net worth forecast

#### Scenario: Salary and bills
- **WHEN** "Salary" brings in 4,500.00 and bills take 1,200.00 in January
- **THEN** net worth rises by 3,300.00 over January, other items aside

#### Scenario: The house
- **WHEN** "House" is valued at 300,000.00 today
- **THEN** it counts as 300,000.00 in every forecast month

### Requirement: A loan installment costs its interest
Each installment of a loan on an active account SHALL lower the net worth
forecast by its interest only, on its date, whichever account pays it,
since its principal lowers the debt by as much as it leaves the account.

#### Scenario: The mortgage
- **WHEN** "House A"'s December installment is 900.00, of which 450.00 is
  interest
- **THEN** net worth drops by 450.00 for it in December

#### Scenario: A loan paid off
- **WHEN** "Car loan"'s last installment is in March 2027
- **THEN** it costs its interest through March 2027 and nothing after

### Requirement: Everyday or net worth on the Forecast page
The Forecast page SHALL offer an Everyday | Net worth switch in its
header, Everyday at first, and SHALL keep the choice in the address. The
Net worth view SHALL have a 1 year / 3 years / 5 years switch, 1 year at
first, also kept in the address. The Expected panel SHALL stay beside
both views.

#### Scenario: Switching to net worth
- **WHEN** the user chooses Net worth
- **THEN** the address shows view=net-worth, the horizon switch offers 1
  year, 3 years and 5 years with 1 year chosen, and Coming up isn't shown

#### Scenario: A link to five years
- **WHEN** the user opens /forecast?view=net-worth&years=5
- **THEN** the Net worth view shows 5 years

### Requirement: The net worth view
The Net worth view SHALL show three whole-euro figures:
- "Today", with today's date;
- "Change", signed, over the horizon;
- "In N years", with its month.

Under the figures it SHALL say: "Bills, loans, budgets and expected items.
Loans count their interest; moving money between your accounts,
investments and property don't change it." Then comes the chart, with
nothing under it.

#### Scenario: One year
- **WHEN** net worth is 77,000.00 today and 101,300.00 at the end of
  November 2027
- **THEN** the figures read "Today €77,000", "Change +€24,300" and "In 1
  year €101,300 · Nov 2027"

### Requirement: The net worth chart on Forecast
The chart SHALL show net worth at each month's end as a solid line
without fill, whose Y axis scales to the line and shows zero when in
range. Negative net worth SHALL use the normal colours. Its time axis
SHALL mark months over 1 year and Januaries over 3 or 5 years. Hovering a
month SHALL show the month, its net worth and the change from the month
before.

#### Scenario: Hover a month
- **WHEN** the user hovers December 2026
- **THEN** the tooltip shows "December 2026", its net worth and the change
  from November

#### Scenario: Negative net worth
- **WHEN** net worth is below zero
- **THEN** the line keeps its normal colour

## MODIFIED Requirements

### Requirement: The Forecast page
The Forecast page SHALL forecast the pot, without an account choice. In
the Everyday view, a 30 days / 90 days switch in the header SHALL set the
horizon, 90 days at first, and SHALL keep it in the address. Above the
chart, three figures SHALL each show a whole-euro value with its date
beneath:
- Today;
- Lowest, the lowest balance after today;
- "In N days".

#### Scenario: Opening Forecast
- **WHEN** the user opens /forecast on 12 November
- **THEN** it shows "Today €1,840 · Thu 12 Nov", "Lowest €312 · 27 Nov"
  and "In 90 days €2,105 · 10 Feb", with a 90-day chart and no account
  choice

#### Scenario: A link to 30 days
- **WHEN** the user opens /forecast?days=30
- **THEN** the chart and the figures cover 30 days, and the last figure
  reads "In 30 days"

### Requirement: Nothing coming up
When no item falls within the horizon, the page SHALL show an empty state
saying nothing is expected in the next 30 or 90 days, or 1, 3 or 5 years,
in place of the chart and the Lowest or Change figure.

#### Scenario: A new household
- **WHEN** there are no bills, loans, budgets or expected items
- **THEN** the page says "Nothing expected in the next 90 days" and shows
  no chart

#### Scenario: Nothing in net worth either
- **WHEN** there are no bills, loans, budgets or expected items and the
  user views Net worth over 3 years
- **THEN** the page says "Nothing expected in the next 3 years" and shows
  no chart

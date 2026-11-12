## ADDED Requirements

### Requirement: One Everyday forecast
The system SHALL forecast the Everyday money as one pot: the active
accounts of the Everyday tier together, or of the only tier in use, as the
Overview's Balance tile counts them. The forecast SHALL start from their
balance at the end of today and apply every expected item after today
within a horizon of 30 or 90 days, in date order. A transfer between two
accounts of the pot SHALL NOT be an item.

#### Scenario: Two accounts in one pot
- **WHEN** "Crelan" holds 1,500.00 and "Revolut" 340.00, both checking
- **THEN** the forecast starts at 1,840.00

#### Scenario: Moving money between them
- **WHEN** the user moves 200.00 from "Crelan" to "Revolut" every month
- **THEN** the forecast doesn't change because of it

#### Scenario: Only savings accounts
- **WHEN** the only active accounts are savings accounts
- **THEN** the forecast covers the Savings tier

### Requirement: Bills are forecast on their day
Each bill of a Bills category other than a loan category SHALL be an
outflow of its amount on its day in every month it counts in, on the
month's last day when the month is shorter.

#### Scenario: Streaming next month
- **WHEN** "Streaming" has Netflix 17.99 on the 5th and Spotify 10.99 on
  the 21st, and the user looks at December
- **THEN** the forecast takes 17.99 on 5 December and 10.99 on 21 December

#### Scenario: A bill that ended
- **WHEN** Disney+ was removed from "Streaming" from December on
- **THEN** the forecast has no Disney+ from December

#### Scenario: Rent on the 31st
- **WHEN** "Rent" is due on the 31st
- **THEN** the forecast takes it on 28 February 2027

### Requirement: Loan installments are forecast on their date
Each installment of a loan on an active account that is paid from an
account in the pot SHALL be an outflow of the installment's payment on its
date. A loan category's bills SHALL NOT be forecast as bills as well.

#### Scenario: The mortgage
- **WHEN** "House A" is paid from "Crelan" with 900.00 on the 2nd of each
  month
- **THEN** the forecast takes 900.00 on 2 December and 2 January, once each

#### Scenario: Paid from outside the pot
- **WHEN** "Car loan" is paid from a savings account and the pot is
  Everyday
- **THEN** its installments aren't in the forecast

### Requirement: Expected items
The user SHALL be able to add, edit and delete expected items, each with a
name, in or out, an amount above zero and a day of the month from 1 to 31.
An item MAY name a category, or an account a transfer goes to or comes
from, to recognise it by. Each SHALL be expected every month on its day,
on the month's last day when the month is shorter.

#### Scenario: Salary
- **WHEN** the user adds "Salary", in, 4,500.00 on the 25th, recognised by
  "Salary"
- **THEN** the forecast adds 4,500.00 on the 25th of every month ahead

#### Scenario: An amount of zero
- **WHEN** the user saves an expected item with an amount of 0.00
- **THEN** the system rejects it

### Requirement: An expected item is recognised
In the current month, an expected item SHALL count as received once a
transaction dated this month goes its way, whatever the amount:
- with a category, a transaction in that category or its subcategories;
- with an account, a transfer to that account for an out item, or from it
  for an in item.

An item without either SHALL never count as received.

#### Scenario: Salary arrives early
- **WHEN** "Salary" is expected 4,500.00 on the 25th, and 4,630.00
  categorized "Salary" arrives on 24 November
- **THEN** the forecast adds nothing on 25 November, and 4,500.00 on 25
  December

#### Scenario: Savings by transfer
- **WHEN** "Savings" is out 500.00 on the 1st, recognised by
  "Spaarrekening", and on 1 November a transfer of 500.00 went from
  "Crelan" to "Spaarrekening"
- **THEN** November doesn't expect it again, and December does

#### Scenario: Nothing to recognise it by
- **WHEN** "Pocket money" is out 50.00 on the 10th without a category or
  account, and it is 12 November
- **THEN** the forecast takes it on 13 November and on 10 December

### Requirement: An expected item doesn't double a bill
An expected item's category SHALL NOT be a Bills category or a loan's
payment category, and its account SHALL NOT be in the pot. The system SHALL
reject such an item, so a bill or an installment is never forecast twice.

#### Scenario: Streaming is a Bills category
- **WHEN** the user saves an expected item recognised by "Streaming"
- **THEN** the system rejects it, saying its bills are already forecast

#### Scenario: A transfer within the pot
- **WHEN** the pot is Everyday and the user picks "Revolut" to recognise
  an item by
- **THEN** the system rejects it

### Requirement: What already happened this month is not expected again
In the current month, a bill that is paid, paid over or paid under, an
installment that is posted or covered, and an expected item that is
received SHALL NOT be forecast.

#### Scenario: Netflix paid
- **WHEN** it is 12 November and Netflix, due on the 5th, was paid on
  6 November
- **THEN** the forecast has no Netflix in November, and has it on
  5 December

#### Scenario: Paid before its day
- **WHEN** Spotify is due on 21 November and was paid on 12 November
- **THEN** the forecast has no Spotify on 21 November

### Requirement: A late item is expected tomorrow
In the current month, an item that is not paid, posted or received and
whose day is today or earlier SHALL be forecast tomorrow. This holds while
a bill is not seen, while an installment is not missed, and for an
expected item until the month ends. A missed bill and a missed installment
SHALL NOT be forecast.

#### Scenario: Disney+ not seen yet
- **WHEN** it is 12 November and Disney+ of 11.99, due on the 8th, is not
  paid
- **THEN** the forecast takes 11.99 on 13 November

#### Scenario: Due today
- **WHEN** it is 12 November and a bill due today is not paid yet
- **THEN** the forecast takes it on 13 November

#### Scenario: A missed bill
- **WHEN** it is 28 November and Spotify, due on the 21st, is missed
- **THEN** the forecast has no Spotify in November

#### Scenario: Salary a few days late
- **WHEN** "Salary" is expected on the 25th and nothing in "Salary" has
  arrived by 27 November
- **THEN** the forecast adds it on 28 November

#### Scenario: Never arrived
- **WHEN** "Salary" never arrived in November
- **THEN** December expects it once, on 25 December

### Requirement: The Forecast page
The Forecast page SHALL forecast the pot, without an account choice. Above
its chart it SHALL show three figures:
- the balance today;
- the lowest balance after today, with its date;
- the balance at the horizon's end.

A 30 days / 90 days switch SHALL set the horizon, 90 days at first.

#### Scenario: Opening Forecast
- **WHEN** the user opens Forecast
- **THEN** it shows "Today", "Lowest" and "In 90 days" figures and a 90-day
  chart, with no account choice

#### Scenario: Switching to 30 days
- **WHEN** the user chooses 30 days
- **THEN** the chart and the figures cover 30 days, and the last figure
  reads "In 30 days"

### Requirement: The forecast chart
The chart SHALL show the balance from today as a stepped line, inside a Y
axis that includes zero. It SHALL label the lowest point, as "Low €312 ·
27 Nov", when that point falls after today and below today's balance. The
part below zero SHALL be in the critical colour. Hovering a day SHALL show
its date, its balance and that day's items.

#### Scenario: Hover a payday
- **WHEN** the user hovers 25 November
- **THEN** the tooltip shows "Tue 25 Nov", the balance and "Salary
  +€4,500"

#### Scenario: Running short
- **WHEN** income is expected and the forecast reaches -150.00
- **THEN** the part below zero and the low label are in the critical colour

### Requirement: Coming up
Below the chart, a "Coming up" list SHALL show the horizon's items grouped
by day. Each day SHALL have a header with its date and the balance after
it. Each item SHALL show its name, its source with its category or loan,
and its amount, with money in in the positive colour. A late item SHALL
say when it was due, in the warning colour. Choosing an item SHALL open
where it is kept.

#### Scenario: A day in the list
- **WHEN** Spotify of 10.99 is due on 21 November and the balance after it
  is 1,612.40
- **THEN** a "Fri 21 Nov" header shows €1,612.40, and beneath it "Spotify",
  "Bill · Streaming" and −€10.99

#### Scenario: A late bill
- **WHEN** Disney+ was due on 8 November and is not seen on 12 November
- **THEN** it is listed under 13 November with "Due 8 Nov · not seen yet"
  in the warning colour

#### Scenario: Where an item is kept
- **WHEN** the user chooses a bill, an installment or an expected item
- **THEN** a bill opens Budgets on its month, an installment opens its
  loan's schedule at that installment, and an expected item opens its
  sheet

#### Scenario: Nothing coming up
- **WHEN** no item falls within the horizon
- **THEN** the list says "Nothing expected in the next 90 days"

### Requirement: The Expected list
The Forecast page SHALL list the expected items by day, each with its day,
name, signed amount and this month's status: received with its date,
expected with its date, or late. "Add expected" and choosing an item SHALL
open a sheet with in or out, name, amount, day and what to recognise it
by. The sheet SHALL offer only categories and accounts allowed for it and
explain recognition in one line. An item's sheet SHALL offer Delete.

#### Scenario: Salary received
- **WHEN** "Salary" arrived on 24 November
- **THEN** its line reads "25 Salary +€4,500 Received 24 Nov"

#### Scenario: Adding salary
- **WHEN** the user chooses Add expected, picks In, enters "Salary",
  4,500.00, day 25 and the category "Salary", and saves
- **THEN** the sheet closes, "Salary" is listed, and the chart and Coming
  up include it

#### Scenario: Bills categories aren't offered
- **WHEN** the user opens the category choice in the sheet
- **THEN** Bills categories and loan categories aren't offered

### Requirement: Forecast without expected income
When no expected item goes in, the Forecast page SHALL say so above the
chart: "No income expected: this forecast only counts what goes out". It
SHALL offer "Add expected income", which opens the sheet set to In. The
chart SHALL then not use the critical colour, nor label the low point in it.

#### Scenario: Only bills
- **WHEN** there are bills and installments but no expected income, and
  the forecast falls below zero
- **THEN** the note and "Add expected income" show, and the line below zero
  is not in the critical colour

### Requirement: The Forecast page on a phone
At a phone's width the three figures SHALL sit in one row of compact
figures above the chart. Coming up SHALL keep each amount on the right of
its line. The expected item sheet SHALL open from the bottom.

#### Scenario: Forecast on a phone
- **WHEN** the user opens Forecast on a 390px wide screen
- **THEN** the page doesn't scroll sideways, the figures fit in one row,
  and Add expected opens a bottom sheet

## REMOVED Requirements

### Requirement: Define recurring transaction
**Reason**: Replaced by expected items, which have no account and are
monthly only. Bills and loan installments come in by themselves.
**Migration**: Each monthly recurring transaction becomes an expected item
with its payee as name, its sign as in or out, its amount, its start
date's day and its category. Its category is kept only when an expected
item may use it. Weekly, biweekly, yearly and ended ones are dropped.

### Requirement: Edit and delete recurring transaction
**Reason**: Replaced by "Expected items".
**Migration**: Edit or delete the expected item instead.

### Requirement: Project account balance forward
**Reason**: The forecast now covers the Everyday pot, not one account.
**Migration**: See "One Everyday forecast".

### Requirement: Forecast is a projection, not a reconciliation
**Reason**: The forecast now uses what already happened this month, so
that nothing is counted twice.
**Migration**: See "What already happened this month is not expected
again" and "A late item is expected tomorrow".

### Requirement: Recurring-transaction form uses the searchable category picker
**Reason**: Recurring transactions are gone.
**Migration**: The expected item sheet uses the searchable category picker,
limited to the categories an expected item may use.

### Requirement: A loan is projected along its schedule
**Reason**: There is no per-account forecast any more. A loan's schedule
page already shows its balance along the schedule. A net worth forecast
(#71) will bring it back.
**Migration**: None.

### Requirement: A loan's installments leave its paying account
**Reason**: Replaced by "Loan installments are forecast on their date".
The rule about overlapping recurring transactions goes, since expected
items can't use a loan's payment category.
**Migration**: See "Loan installments are forecast on their date".

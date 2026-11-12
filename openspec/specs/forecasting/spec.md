# Forecasting Specification

## Purpose

Forecasting projects the Everyday money forward over 30 or 90 days, from
today's balance plus the bills, loan installments, budgets and expected
items already in the app, so the user sees upcoming cash flow, and whether
the money runs short, before it happens.

## Requirements

### Requirement: One Everyday forecast
The system SHALL forecast the Everyday money as one pot: the active
accounts of the Everyday tier together, or of the only tier in use, as the
Overview's Balance tile counts them. The forecast SHALL start from their
balance at the end of today and apply every forecast item after today
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

### Requirement: Monthly budgets are spread over the month
For each category with a monthly limit, the forecast SHALL spread what is
left of the limit evenly over the month's days after today. What is left
is the limit minus the month's spending, never below zero. A later month
SHALL spread its whole limit, with that month's override, over all its
days. A budget that a parent's budget covers SHALL NOT be spread itself.

#### Scenario: Groceries this month
- **WHEN** it is 12 November, "Groceries" has a 600.00 limit and 380.00
  was spent
- **THEN** the forecast takes 220.00 spread over 13 to 30 November, about
  12.22 a day

#### Scenario: Over the limit
- **WHEN** "Groceries" has already spent 650.00 of 600.00
- **THEN** nothing more is taken for it in November

#### Scenario: Next month
- **WHEN** December's limit for "Groceries" is overridden to 800.00
- **THEN** the forecast takes 800.00 spread over 1 to 31 December

#### Scenario: A cap inside a parent
- **WHEN** "Food" has a 900.00 limit and its subcategory "Takeaway" a
  150.00 cap
- **THEN** only "Food"'s 900.00 is spread, not "Takeaway"'s as well

### Requirement: Yearly budgets are spread over the year
For each yearly budget, the forecast SHALL spread what is left of the
year's amount evenly over the year's days after today, never below zero.
In a later year it SHALL spread that year's amount over all its days.

#### Scenario: Holidays
- **WHEN** it is 12 November, "Holidays" has 3,000.00 for the year and
  2,800.00 was spent
- **THEN** the forecast takes 200.00 spread over 13 November to
  31 December

#### Scenario: Into next year
- **WHEN** the horizon reaches January 2027 and "Holidays" has 3,000.00
  for 2027
- **THEN** each January day takes 3,000.00 divided by 365

### Requirement: Yearly targets are forecast on their due date
A yearly budget on a date SHALL be an outflow of what is left of its
amount on its due date, when that date is after today and within the
horizon. A target that is paid, as the `yearly-budgets` capability
defines it, SHALL NOT be forecast. One not seen yet SHALL be forecast
tomorrow, and an overdue one SHALL NOT be forecast.

#### Scenario: Car insurance
- **WHEN** "Car insurance" is 640.00 due on 15 January and nothing was
  paid
- **THEN** the forecast takes 640.00 on 15 January

#### Scenario: Partly paid
- **WHEN** "Car insurance" is 640.00 due on 15 November and 200.00 was
  already paid
- **THEN** the forecast takes 440.00 on 15 November

### Requirement: Bills inside a budgeted parent are not counted twice
When a parent's monthly or yearly budget covers a Bills subcategory, the
part of it the forecast spreads SHALL leave out the subcategory's bills
still to come in that period, since they are forecast on their days.

#### Scenario: Streaming under Leisure
- **WHEN** "Leisure" has a 300.00 limit, its Bills subcategory "Streaming"
  has 40.97 of bills still to come in December, and nothing was spent yet
- **THEN** December spreads 259.03 for "Leisure" and takes the bills on
  their days

### Requirement: Expected items
The user SHALL be able to add, edit and delete expected items. Each has a
name, in or out, an amount above zero, a day of the month from 1 to 31,
and either a category or an account a transfer goes to or comes from, to
recognise it by. Each SHALL be expected every month on its day, on the
month's last day when the month is shorter.

#### Scenario: Salary
- **WHEN** the user adds "Salary", in, 4,500.00 on the 25th, recognised by
  "Salary"
- **THEN** the forecast adds 4,500.00 on the 25th of every month ahead

#### Scenario: An amount of zero
- **WHEN** the user saves an expected item with an amount of 0.00
- **THEN** the system rejects it

#### Scenario: Nothing to recognise it by
- **WHEN** the user saves an expected item without a category or account
- **THEN** the system rejects it, asking how to recognise it

### Requirement: An expected item is recognised
In the current month, an expected item SHALL count as received once a
transaction dated this month goes its way, for an amount within 25% of the
item's. That is a transaction in its category or the category's
subcategories, including a category guess not yet confirmed. For an item
with an account, it is a transfer to that account for an out item, or
from it for an in item.

#### Scenario: Salary arrives early
- **WHEN** "Salary" is expected 4,500.00 on the 25th, and 4,630.00
  categorized "Salary" arrives on 24 November
- **THEN** the forecast adds nothing on 25 November, and 4,500.00 on 25
  December

#### Scenario: Still a guess
- **WHEN** the 4,630.00 is waiting in Review with "Salary" guessed
- **THEN** it counts as received all the same

#### Scenario: A refund isn't the salary
- **WHEN** a refund of 80.00 is categorized "Salary" on 10 November
- **THEN** "Salary" is still expected on 25 November

#### Scenario: Savings by transfer
- **WHEN** "Savings" is out 500.00 on the 1st, recognised by
  "Spaarrekening", and on 1 November a transfer of 500.00 went from
  "Crelan" to "Spaarrekening"
- **THEN** November doesn't expect it again, and December does

### Requirement: An expected item doesn't double another item
An expected item's category SHALL NOT have a budget of any kind, nor be
covered by a parent's budget, nor be a loan's payment category. Its account
SHALL NOT be in the pot. The system SHALL reject such an item, so nothing
is forecast twice.

#### Scenario: Streaming is a Bills category
- **WHEN** the user saves an expected item recognised by "Streaming"
- **THEN** the system rejects it, saying its budget is already forecast

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
whose day is today or earlier SHALL be forecast tomorrow:
- a bill while it is not seen;
- an installment while it is not missed;
- an expected item until the month ends.

A missed bill, a missed installment and an expected item that never
came that month SHALL NOT be forecast.

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

### Requirement: Income is expected
The forecast SHALL count as having income when at least one expected item
goes in, whether or not it falls within the horizon.

#### Scenario: After payday
- **WHEN** "Salary" is expected in on the 25th, it is 26 November, and the
  Overview projects the next 30 days
- **THEN** income counts as expected, even though the 25 December payday
  falls outside the 30 days

### Requirement: The Forecast page
The Forecast page SHALL forecast the pot, without an account choice. A
30 days / 90 days switch in the header SHALL set the horizon, 90 days at
first, and SHALL keep it in the address. Above the chart, three figures
SHALL each show a whole-euro value with its date beneath:
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

### Requirement: The forecast says what it counts
Under the figures, the page SHALL say what the forecast counts: "Bills,
loans, budgets and expected items. Spending without a budget isn't
included." It SHALL show the Overview's stale-import line when an active
account of the pot was last imported more than 7 days ago or never.

#### Scenario: A stale account
- **WHEN** "Crelan" was last imported 12 days ago
- **THEN** Forecast says "Crelan: last import 12 days ago" in the warning
  colour

### Requirement: The forecast chart
The chart SHALL show the balance from today as a solid line without fill,
inside a Y axis that includes zero. Its time axis SHALL mark weeks over
30 days and months over 90. It SHALL label the lowest point, as "Low €312
· 27 Nov", when that falls after today and below today's balance. Hovering
a day SHALL show its date, its balance and up to three of that day's items.

#### Scenario: Hover a payday
- **WHEN** the user hovers 25 November
- **THEN** the tooltip shows "Tue 25 Nov", the balance and "Salary
  +€4,500"

#### Scenario: A busy day
- **WHEN** five items fall on 1 December
- **THEN** the tooltip lists three and "+2 more"

#### Scenario: Running short
- **WHEN** income is expected and the forecast reaches -150.00
- **THEN** the part below zero, the low label and the Lowest figure are in
  the critical colour

### Requirement: Coming up
A "Coming up" panel SHALL list the horizon's items by day, under a header
per day with its date and the whole-euro balance after it. An item SHALL
show its name, its source and its amount in cents, money in in the
positive colour. Budgets SHALL show as one line per budget per month.
Choosing an item SHALL open where it is kept.

#### Scenario: A day in the list
- **WHEN** Spotify of 10.99 is due on 21 November and the balance after it
  is 1,612.40
- **THEN** a "Fri 21 Nov" header shows €1,612, and beneath it "Spotify",
  "Bill · Streaming" and −€10.99

#### Scenario: Spread budgets
- **WHEN** "Groceries" has 220.00 left in November
- **THEN** under 13 November a line reads "Groceries", "Budget · €220 left,
  spread to 30 Nov" and −€220.00

#### Scenario: Where an item is kept
- **WHEN** the user chooses a bill, an installment, a budget or an
  expected item
- **THEN** a bill or budget opens Budgets on its month with that
  category's sheet, an installment opens its loan's schedule at that
  installment, and an expected item opens its sheet

### Requirement: Late and missed items in Coming up
A late item SHALL carry a "Not seen" chip in the warning colour and say
when it was due. A bill or installment that went missed this month SHALL
stay listed under its own day, greyed, as "Missed · not counted", so the
user sees why it left the forecast.

#### Scenario: A late bill
- **WHEN** Disney+ was due on 8 November and is not seen on 12 November
- **THEN** it is listed under 13 November with a "Not seen" chip and
  "Bill · Streaming · due 8 Nov"

#### Scenario: A missed bill
- **WHEN** Spotify, due on 21 November, is missed on 28 November
- **THEN** it is not in the forecast, and is shown greyed as "Missed · not
  counted"

### Requirement: The Expected panel
An "Expected" panel SHALL list the expected items by day, each with its
day, name, signed amount and its status this month: "Received 24 Nov",
"Next 25 Nov" or late. "Add item" and choosing an item SHALL open the
item's sheet. Without any items the panel SHALL say what expected items
are for and offer "Add expected income".

#### Scenario: Salary received
- **WHEN** "Salary" arrived on 24 November
- **THEN** its line reads "25 Salary +€4,500 Received 24 Nov"

#### Scenario: No expected items yet
- **WHEN** the user has no expected items
- **THEN** the panel says income such as salary goes here, with "Add
  expected income", which opens the sheet set to In

### Requirement: The expected item sheet
The sheet SHALL ask for in or out, name, amount, day, and what to
recognise the item by. That list SHALL hold, in two groups, the
categories and the accounts an item may use. A hint under it SHALL follow
the direction: "Counts as received when money comes in here this month"
for in, "Counts as paid when money goes out here this month" for out.
Editing SHALL offer Delete.

#### Scenario: Adding salary
- **WHEN** the user chooses "Add item", picks In, enters "Salary",
  4,500.00, day 25 and the category "Salary", and saves
- **THEN** the sheet closes, "Salary" is listed, and the chart and Coming
  up include it

#### Scenario: Budgeted categories aren't offered
- **WHEN** the user opens the list to recognise an item by
- **THEN** categories with a budget, categories under a budgeted parent,
  loan categories and accounts of the pot aren't offered

### Requirement: Forecast without expected income
When no expected item goes in, the Forecast page SHALL say, in a neutral
note above the chart: "Only money going out is counted. Add your salary to
see the whole picture." The chart and the Lowest figure SHALL then not use
the critical colour. The note SHALL NOT show while the Expected panel is
empty, since that panel already asks for income.

#### Scenario: Only out items
- **WHEN** there is an expected out item but no expected income, and the
  forecast falls below zero
- **THEN** the note shows, and the line below zero and the Lowest figure
  are not in the critical colour

### Requirement: Nothing coming up
When no item falls within the horizon, the page SHALL show an empty state
saying nothing is expected in the next 30 or 90 days in place of the
chart and the Lowest figure.

#### Scenario: A new household
- **WHEN** there are no bills, loans, budgets or expected items
- **THEN** the page says "Nothing expected in the next 90 days" and shows
  no chart

### Requirement: The Forecast page layout
On a wide screen, the figures and chart SHALL share one panel, beside the
Expected panel, with Coming up below them. On a phone the order SHALL be
the figures and chart, then Expected, then Coming up. The three figures
SHALL fit in one row at a phone's width, and the sheet SHALL open from
the bottom there.

#### Scenario: Forecast on a phone
- **WHEN** the user opens Forecast on a 390px wide screen
- **THEN** the page doesn't scroll sideways, the figures fit in one row,
  Expected comes before Coming up, and "Add item" opens a bottom sheet

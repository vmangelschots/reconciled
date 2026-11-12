# Spec Delta

## Purpose

Lets a category hold the fixed bills it pays every month, so it shows
which bills are paid, due or missed instead of warning that it's ahead
of the month's pace.

## ADDED Requirements

### Requirement: A Bills category holds its bills
A category of the Bills kind SHALL hold a list of bills, each with a day
of the month from 1 to 31, a name and an amount above zero. Its budget
for a month SHALL be the total of the bills that count in that month. A
bill SHALL count from the month it was added; editing or removing a bill
SHALL apply to every month it counts in. A Bills category with no bills
SHALL have no budget.

#### Scenario: Streaming's budget
- **WHEN** "Streaming" is a Bills category with Netflix 17.99 on the 5th,
  Disney+ 11.99 on the 8th and Spotify 10.99 on the 21st
- **THEN** its budget for the month is 40.97

#### Scenario: A bill added in November
- **WHEN** the user adds Spotify to "Streaming" in November 2026
- **THEN** November and later count Spotify, and October's budget for
  "Streaming" doesn't include it

#### Scenario: A bill without an amount
- **WHEN** the user saves a bill with an amount of 0.00
- **THEN** the system rejects it

### Requirement: The 31st means the last day
A bill's day SHALL fall on the month's last day in months that have fewer
days.

#### Scenario: February
- **WHEN** "Rent" is due on the 31st and the month is February 2027
- **THEN** it is due on 28 February 2027

### Requirement: Switching to or from Bills drops the old amounts
Switching a category to Bills SHALL delete its monthly limits, or its
yearly amounts and history. Switching a Bills category to another kind
SHALL delete its bills. When there is something to delete, the Budgets
page SHALL ask for confirmation in a dialog first, saying what will be
removed, as for the other kinds.

#### Scenario: Monthly to Bills
- **WHEN** "Streaming" has a 45.00 monthly limit and the user switches it
  to Bills
- **THEN** a dialog says the 45.00 monthly limit will be removed, and
  after confirming "Streaming" has no limits and no bills yet

#### Scenario: Bills to monthly
- **WHEN** "Streaming" has three bills and the user switches it to monthly
- **THEN** a dialog says its 3 bills will be removed

### Requirement: A bill is matched to its payment
In a month, each bill SHALL be paid by at most one outflow in its
category or its subcategories, and each outflow SHALL pay at most one
bill. An outflow SHALL only pay a bill when it is dated in the same
calendar month within 4 days of the bill's day, and its amount is within
the larger of 30% and 5.00 of the bill's amount.

#### Scenario: Netflix paid a day late
- **WHEN** Netflix is 17.99 on the 5th and "Streaming" has an outflow of
  17.99 on 6 November
- **THEN** that outflow pays Netflix for November

#### Scenario: Too far from its day
- **WHEN** Spotify is due on the 21st and its 10.99 leaves on 27 November
- **THEN** it doesn't pay Spotify

#### Scenario: Not across months
- **WHEN** a bill is due on the 30th and its payment is dated 2 December
- **THEN** it doesn't pay November's bill, and in December it pays
  nothing and counts as spending beyond the bills

### Requirement: The closest payment pays a bill
When several outflows could pay a bill, the one closest in amount SHALL
pay it, then the one closest in date. Bills SHALL be matched in order of
their day.

#### Scenario: Two candidates
- **WHEN** Netflix is 17.99 on the 5th and "Streaming" has outflows of
  17.99 on 4 November and 15.00 on 5 November
- **THEN** the 17.99 pays Netflix

#### Scenario: Two bills of the same amount
- **WHEN** "Internet" has two bills of 25.00 on the 3rd and two outflows
  of 25.00 on 3 November
- **THEN** each outflow pays one of the bills

### Requirement: A bill's state
Each bill SHALL show one state as of the reference day: today for the
current month, the month's last day for a past month. A future month's
bills SHALL be upcoming. A paid bill SHALL be paid, or paid over when its
payment is more than its amount by more than the larger of 5% and 1.00.
An unpaid bill SHALL be upcoming before the 3 days up to its day, due
soon in those days, not seen in the 5 days after its day, and missed
later or once the month has ended.

#### Scenario: Paid
- **WHEN** Netflix of 17.99 is paid by 17.99
- **THEN** Netflix is paid

#### Scenario: A price rise
- **WHEN** Netflix of 17.99 is paid by 19.99
- **THEN** Netflix is paid over, by 2.00

#### Scenario: Due soon
- **WHEN** it is 19 November and Spotify is due on the 21st and unpaid
- **THEN** Spotify is due soon, in 2 days

#### Scenario: Not seen, then missed
- **WHEN** Spotify is due on 21 November and nothing paid it
- **THEN** it is not seen from 22 to 26 November and missed from 27
  November

#### Scenario: A finished month
- **WHEN** the user views October and Spotify was due on 30 October and
  never paid
- **THEN** Spotify is missed

### Requirement: When a Bills category is over
A Bills category SHALL be over in a month when its spending is more than
its budget for that month, whatever the bills' states. Its spending is the
net outflow of the category and its subcategories, as for other budgets,
so spending no bill accounts for also counts. A Bills category SHALL NOT
be judged against the month's pace.

#### Scenario: Extra spending money
- **WHEN** "Spending money" has two bills of 200.00 on the 1st, both paid,
  and an extra 50.00 left the category on 15 November
- **THEN** "Spending money" is 50.00 over

#### Scenario: All paid early is not a warning
- **WHEN** on 8 November every bill of "Streaming" is paid and its
  spending equals its budget
- **THEN** "Streaming" is not listed in Needs attention and its bar isn't
  in the warning colour

### Requirement: Bills in the month's totals
A Bills category's budget SHALL count as a monthly limit, and its spending
as spending under a limit, in the Overview's budget tile and the Budgets
headline, by the same rules as monthly limits, including a parent's
budget covering its subcategories and a subcategory's cap.

#### Scenario: Limits and bills together
- **WHEN** "Groceries" has a 400.00 limit and "Streaming" has bills of
  40.97
- **THEN** the budget tile's limits total 440.97

### Requirement: Bill warnings in Needs attention
Needs attention SHALL list each missed bill in the chosen month as
"<bill> missed", with its category, day and amount beneath, opening the
Budgets page on that month. A Bills category that is over SHALL be listed
among the category warnings, as "<category> €N over". Bills that are due
soon or not seen SHALL NOT be listed.

#### Scenario: Spotify missed
- **WHEN** on 28 November Spotify of 10.99, due on the 21st, has not been
  paid
- **THEN** Needs attention lists "Spotify missed" with "Streaming · due
  21 Nov · €11"

#### Scenario: Not seen yet
- **WHEN** on 23 November Spotify, due on the 21st, has not been paid
- **THEN** Needs attention doesn't list it

### Requirement: The bill bar
A Bills row SHALL show a bar with one segment per bill, sized by the
bill's amount and filled by its state: paid and paid over in the positive
colour, due soon lightly filled, not seen in the warning colour, missed in
the critical colour, upcoming unfilled. It SHALL show no pace marker.

#### Scenario: Segments follow the amounts
- **WHEN** "Mortgage" has bills of 1,050.00 and 420.00
- **THEN** the first segment is two and a half times as wide as the second

### Requirement: A Bills row on the Budgets page
A Bills row's figure SHALL be what's left to pay, "Paid" when every bill
is paid, or how much over in the critical colour. Its caption SHALL say
how many bills are paid, then the most pressing other bill: missed, else
not seen, else the next one due.

#### Scenario: Two of three paid
- **WHEN** on 19 November Netflix and Disney+ are paid and Spotify of 10.99
  is due on the 21st
- **THEN** the "Streaming" row shows "€11 to pay" and "2 of 3 paid ·
  Spotify due 21 Nov"

#### Scenario: All paid
- **WHEN** every bill of "Streaming" is paid and nothing else was spent
- **THEN** the row shows "Paid" with every segment in the positive colour

#### Scenario: A missed bill
- **WHEN** Spotify is missed
- **THEN** its segment is in the critical colour and the caption says
  "2 of 3 paid · Spotify missed"

### Requirement: Bills in the budget sheet
The sheet of a Bills category SHALL list its bills in order of their day,
each with its day, name, amount and state, and the payment's date for a
paid bill, or by how much it was paid over. The budget editor SHALL offer
Bills as a fourth kind. With Bills chosen, it SHALL let the user add,
edit and remove bills in place, show the total per month, and hint that
a bill's day is the day it usually leaves the account.

#### Scenario: The Streaming sheet
- **WHEN** the user opens "Streaming" on 19 November
- **THEN** the sheet lists "5 Netflix €17.99 Paid 5 Nov", "8 Disney+
  €11.99 Paid 9 Nov" and "21 Spotify €10.99 In 2 days"

#### Scenario: Add a bill
- **WHEN** the user adds "Spotify", day 21, 10.99 to "Streaming" and saves
- **THEN** "Streaming" has three bills and a budget of 40.97 a month

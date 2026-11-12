# Spec Delta

## ADDED Requirements

### Requirement: A bill paid at another amount offers an update
When a bill other than a loan bill is paid over or paid under, its line
in the sheet SHALL say what was paid and what was expected, and offer
Update and Just this month. Update SHALL make the paid amount the bill's
amount from the viewed month on, keeping earlier months' amount. Just
this month SHALL expect the paid amount in the viewed month only.

#### Scenario: Netflix went up
- **WHEN** Netflix of 17.99 is paid by 19.99 in November
- **THEN** its line says "Paid €19.99, expected €17.99. Update the bill?"
  with Update and Just this month

#### Scenario: Update from November
- **WHEN** the user chooses Update on that line
- **THEN** Netflix is 19.99 from November on and paid in November, and
  October's budget still counts 17.99

#### Scenario: Just this month
- **WHEN** the user chooses Just this month on that line
- **THEN** November expects 19.99 for Netflix and shows it paid, and
  December expects 17.99 again

#### Scenario: Viewing an earlier month
- **WHEN** the user views October, where Netflix was paid 19.99, and
  chooses Update
- **THEN** Netflix is 19.99 from October on, and September keeps 17.99

### Requirement: A payment that pays no bill can become a bill
The sheet of a Bills category other than a loan category SHALL list the
month's outflows that pay no bill under "Not a bill", each with its day,
payee and amount, and offer Add as bill. Adding SHALL ask for a name,
starting from the payee, and whether it is a bill every month from the
viewed month on or only in that month, and SHALL use the payment's day
and amount.

#### Scenario: A new subscription through PayPal
- **WHEN** "Streaming" has an outflow of 7.99 on 18 November with payee
  "PayPal" that pays no bill, and the user adds it as "Apple TV", every
  month
- **THEN** "Streaming" has a bill Apple TV of 7.99 on the 18th from
  November on, paid in November, and "PayPal" is no longer under "Not a
  bill"

#### Scenario: Only this month
- **WHEN** the user adds that outflow as a bill only in November
- **THEN** November counts it as a paid bill, and December's budget
  doesn't include it

### Requirement: A payment can be marked as extra
A payment under "Not a bill" SHALL offer It's extra, which stops offering
Add as bill for it and shows it muted with Undo. It SHALL still count as
spending beyond the bills.

#### Scenario: An extra for spending money
- **WHEN** "Spending money" has an extra 50.00 transfer on 15 November and
  the user marks it as extra
- **THEN** it stays listed under "Not a bill", muted, without Add as bill,
  and "Spending money" is still 50.00 over

#### Scenario: Undo
- **WHEN** the user chooses Undo on that muted payment
- **THEN** it offers Add as bill and It's extra again

## MODIFIED Requirements

### Requirement: A Bills category holds its bills
A category of the Bills kind SHALL hold a list of bills, each with a day
of the month from 1 to 31, a name and an amount above zero. A bill SHALL
count from the month it was added and, when it ends, through its last
month, and MAY expect another amount in a single month. Its budget for a
month SHALL be the total of what the bills that count in that month
expect. Editing or removing a bill in the budget editor SHALL apply to
every month it counts in. A Bills category with no bills SHALL have no
budget.

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

#### Scenario: The editor shows today's bills
- **WHEN** Netflix was 17.99 until October and is 19.99 from November, and
  the user opens the budget editor in November
- **THEN** the editor lists Netflix once, at 19.99

### Requirement: A bill is matched to its payment
In a month, each bill SHALL be paid by at most one outflow in its
category or its subcategories, and each outflow SHALL pay at most one
bill. An outflow SHALL only pay a bill when it is dated in the same
calendar month, and its amount is within the larger of 30% and 5.00 of
what the bill expects that month. The payee SHALL NOT matter.

#### Scenario: Netflix paid a day late
- **WHEN** Netflix is 17.99 on the 5th and "Streaming" has an outflow of
  17.99 on 6 November
- **THEN** that outflow pays Netflix for November

#### Scenario: Too far from its day
- **WHEN** Spotify is due on the 21st and its 10.99 leaves on 27 November
- **THEN** it still pays Spotify: within the month, the day only breaks
  ties

#### Scenario: Not across months
- **WHEN** a bill is due on the 30th and its payment is dated 2 December
- **THEN** it doesn't pay November's bill, and in December it pays
  nothing and counts as spending beyond the bills

#### Scenario: Every payee is PayPal
- **WHEN** Netflix 17.99, Disney+ 11.99 and Spotify 10.99 are each paid
  by an outflow with payee "PayPal" for exactly their amount
- **THEN** each outflow pays the bill of its amount

### Requirement: The closest payment pays a bill
The system SHALL pair a category's bills and outflows across the month at
once: the pair closest in amount first, then the pair closest to the
bill's day, until no pair is left within the amount window.

#### Scenario: Two candidates
- **WHEN** Netflix is 17.99 on the 5th and "Streaming" has outflows of
  17.99 on 4 November and 15.00 on 5 November
- **THEN** the 17.99 pays Netflix

#### Scenario: Two bills of the same amount
- **WHEN** "Internet" has two bills of 25.00 on the 3rd and two outflows
  of 25.00 on 3 November
- **THEN** each outflow pays one of the bills

#### Scenario: An earlier bill doesn't take a later bill's payment
- **WHEN** Disney+ 11.99 on the 8th is still unpaid on 22 November and
  Spotify 10.99 on the 21st was paid by 10.99 on the 21st
- **THEN** the 10.99 pays Spotify and Disney+ stays unpaid

#### Scenario: Same amount, three days apart
- **WHEN** "Internet" has bills of 25.00 on the 3rd and the 6th, and
  outflows of 25.00 on 3 and 6 November
- **THEN** the 3 November outflow pays the 3rd's bill and the 6 November
  one the 6th's

### Requirement: A bill's state
Each bill SHALL show one state as of the reference day: today for the
current month, the month's last day for a past month. A future month's
bills SHALL be upcoming. A paid bill SHALL be paid over when its payment
is more than what it expects by more than the larger of 5% and 1.00,
paid under when it is less by more than that, and paid otherwise. An
unpaid bill SHALL be upcoming before the 3 days up to its day, due soon
in those days, not seen in the 5 days after its day, and missed later or
once the month has ended.

#### Scenario: Paid
- **WHEN** Netflix of 17.99 is paid by 17.99
- **THEN** Netflix is paid

#### Scenario: A price rise
- **WHEN** Netflix of 17.99 is paid by 19.99
- **THEN** Netflix is paid over, by 2.00

#### Scenario: A price drop
- **WHEN** Netflix of 17.99 is paid by 15.99
- **THEN** Netflix is paid under, by 2.00, with a neutral chip

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

### Requirement: The bill bar
A Bills row SHALL show a bar with one segment per bill, sized by the
bill's amount and filled by its state: paid, paid over and paid under in
the positive colour, due soon lightly filled, not seen in the warning
colour, missed in the critical colour, upcoming unfilled. When the
category is over, the bar SHALL end with a striped segment in the
critical colour for the amount beyond the bills, never wider than the
bills together. It SHALL show no pace marker.

#### Scenario: Segments follow the amounts
- **WHEN** "Mortgage" has bills of 1,050.00 and 420.00
- **THEN** the first segment is two and a half times as wide as the second

#### Scenario: Paid in full and over
- **WHEN** both bills of "Spending money" are paid and it is 50.00 over
- **THEN** its bar shows two positive segments and a striped critical one
  for 50.00

#### Scenario: Far over
- **WHEN** "Streaming" has 40.97 of bills and is 500.00 over
- **THEN** the striped segment is as wide as the three bills together

#### Scenario: Not over
- **WHEN** a payment pays no bill but the category is still under its
  budget
- **THEN** the bar has no striped segment

### Requirement: Bills in the budget sheet
The sheet of a Bills category SHALL list its bills in order of their day,
each with its day, name, amount and state, the payment's date for a paid
bill, or by how much it was paid over or under. Below them it SHALL list
the payments that pay no bill, under "Not a bill". The budget editor
SHALL offer Bills as a fourth kind. With Bills chosen, it SHALL let the
user add, edit and remove the bills that count in the current month in
place, show the total per month, and hint that a bill's day is the day
it usually leaves the account.

#### Scenario: The Streaming sheet
- **WHEN** the user opens "Streaming" on 19 November
- **THEN** the sheet lists "5 Netflix €17.99 Paid 5 Nov", "8 Disney+
  €11.99 Paid 9 Nov" and "21 Spotify €10.99 In 2 days"

#### Scenario: Add a bill
- **WHEN** the user adds "Spotify", day 21, 10.99 to "Streaming" and saves
- **THEN** "Streaming" has three bills and a budget of 40.97 a month

#### Scenario: A loan category has no prompts
- **WHEN** a payment of "Mortgage" is 35.00 of insurance that pays no
  loan bill
- **THEN** the sheet offers no Not a bill group, Add as bill or update
  prompt, and the bar shows the 35.00 over

# Spec Delta

## ADDED Requirements

### Requirement: Bill changes apply from the viewed month on
Adding, editing or removing a bill, from the budget editor or from a
prompt, SHALL apply from the viewed month on. Earlier months SHALL keep
the bills and amounts they had.

#### Scenario: A price change in November
- **WHEN** Netflix was 17.99 since September and the user changes it to
  19.99 while viewing November
- **THEN** November and later expect 19.99, and September and October
  still expect 17.99

#### Scenario: Removing a bill in November
- **WHEN** the user removes Disney+ while viewing November
- **THEN** November and later don't count it, and October still does

#### Scenario: A change in the bill's first month
- **WHEN** Spotify was added in November and the user changes its amount
  while viewing November
- **THEN** Spotify has the new amount from November on, as one bill

### Requirement: Prompts to review a Bills category
In the current month and the month before, the sheet of a Bills category
other than a loan category SHALL show a "To review" block under its
header, listing each bill paid over or under, with Update, and each
payment that pays no bill, with Add as bill. The block SHALL NOT show when
it has nothing to list, nor in earlier or later months.

#### Scenario: Netflix went up
- **WHEN** on 19 November Netflix of 17.99 was paid by 19.99
- **THEN** "To review" lists "Netflix paid €19.99, expected €17.99" with
  Update

#### Scenario: Update
- **WHEN** the user chooses Update on that line
- **THEN** Netflix expects 19.99 from November on, November shows it
  paid, the line leaves "To review", and October still expects 17.99

#### Scenario: Closing October on 2 November
- **WHEN** on 2 November the user views October, where a PayPal payment
  of 7.99 on 30 October paid no bill
- **THEN** October's sheet lists it under "To review" with Add as bill

#### Scenario: An older month stays quiet
- **WHEN** on 19 November the user views September, where Netflix was paid
  19.99
- **THEN** September's sheet shows no "To review" block

#### Scenario: Nothing to review
- **WHEN** every payment in "Streaming" pays a bill at its amount
- **THEN** there is no "To review" block

### Requirement: Add a payment as a bill
Add as bill SHALL ask for a name, starting from the payee, and add a bill
on the payment's day for the payment's amount, from the payment's month
on.

#### Scenario: A new subscription through PayPal
- **WHEN** "Streaming" has an outflow of 7.99 on 18 November with payee
  "PayPal" that pays no bill, and the user adds it as "Apple TV"
- **THEN** "Streaming" has a bill Apple TV of 7.99 on the 18th from
  November on, paid in November, and "To review" no longer lists it

## MODIFIED Requirements

### Requirement: A Bills category holds its bills
A category of the Bills kind SHALL hold a list of bills, each with a day
of the month from 1 to 31, a name and an amount above zero. A bill SHALL
count from the month it starts in and, when it ends, through its last
month. Its budget for a month SHALL be the total of the bills that count
in that month. A Bills category with no bills SHALL have no budget.

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

### Requirement: A bill is matched to its payment
In a month, each bill SHALL be paid by at most one outflow in its
category or its subcategories, and each outflow SHALL pay at most one
bill. An outflow SHALL only pay a bill when it is dated in the same
calendar month, and its amount is within the larger of 15% and 2.00 of
the bill's amount. The payee SHALL NOT matter.

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

#### Scenario: Too far from the amount
- **WHEN** Spotify is 10.99 and the only outflow in "Streaming" is 8.00
- **THEN** it doesn't pay Spotify, and it is listed as a payment that pays
  no bill

### Requirement: The closest payment pays a bill
The system SHALL pair a category's bills and outflows across the month at
once: the pair closest in amount first, then the pair closest to the
bill's day, until no pair is left within the amount window.

#### Scenario: Two candidates
- **WHEN** Netflix is 17.99 on the 5th and "Streaming" has outflows of
  17.99 on 4 November and 15.99 on 5 November
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
is more than its amount by more than the larger of 5% and 1.00, paid
under when it is less by more than that, and paid otherwise; the
difference SHALL read as "+€2.00" or "−€2.00", never as "over". An unpaid
bill SHALL be upcoming before the 3 days up to its day, due soon in those
days, not seen in the 5 days after its day, and missed later or once the
month has ended.

#### Scenario: Paid
- **WHEN** Netflix of 17.99 is paid by 17.99
- **THEN** Netflix is paid

#### Scenario: A price rise
- **WHEN** Netflix of 17.99 is paid by 19.99
- **THEN** Netflix is paid over, by 2.00, and its chip reads "+€2.00"

#### Scenario: A price drop
- **WHEN** Netflix of 17.99 is paid by 15.99
- **THEN** Netflix is paid under, by 2.00, and its chip reads "−€2.00"

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
its budget for that month by more than the larger of 5% of the budget and
1.00, whatever the bills' states. Its spending is the net outflow of the
category and its subcategories, as for other budgets, so spending no bill
accounts for also counts. A Bills category SHALL NOT be judged against the
month's pace.

#### Scenario: Extra spending money
- **WHEN** "Spending money" has two bills of 200.00 on the 1st, both paid,
  and an extra 50.00 left the category on 15 November
- **THEN** "Spending money" is 50.00 over

#### Scenario: All paid early is not a warning
- **WHEN** on 8 November every bill of "Streaming" is paid and its
  spending equals its budget
- **THEN** "Streaming" is not listed in Needs attention and its bar isn't
  in the warning colour

#### Scenario: A small price rise isn't over
- **WHEN** "Streaming" has 40.97 of bills and Netflix was paid 2.00 more
- **THEN** "Streaming" is not over, and "To review" offers to update
  Netflix

### Requirement: The bill bar
A Bills row SHALL show a bar with one segment per bill, sized by the
bill's amount and filled by its state: paid, paid over and paid under in
the positive colour, due soon lightly filled, not seen in the warning
colour, missed in the critical colour, upcoming unfilled. When the
category is over, the bar SHALL end with a solid segment in the critical
colour for the amount beyond the bills, never wider than the bills
together. It SHALL show no pace marker.

#### Scenario: Segments follow the amounts
- **WHEN** "Mortgage" has bills of 1,050.00 and 420.00
- **THEN** the first segment is two and a half times as wide as the second

#### Scenario: Paid in full and over
- **WHEN** both bills of "Spending money" are paid and it is 50.00 over
- **THEN** its bar shows two positive segments and a critical one for
  50.00

#### Scenario: Far over
- **WHEN** "Streaming" has 40.97 of bills and is 500.00 over
- **THEN** the critical segment is as wide as the three bills together

#### Scenario: Not over
- **WHEN** a payment pays no bill but the category is not over
- **THEN** the bar has no critical segment for it

### Requirement: Bills in the budget sheet
The sheet of a Bills category SHALL list the viewed month's bills once,
in order of their day, each with its day, name, amount and state, the
payment's date for a paid bill, or its difference. Edit bills SHALL turn
that list into editable lines, with the kind switch, an Add bill line,
the total per month and the hint that a bill's day is the day it usually
leaves the account, and Save and Cancel turn it back. The budget editor
SHALL offer Bills as a fourth kind.

#### Scenario: The Streaming sheet
- **WHEN** the user opens "Streaming" on 19 November
- **THEN** the sheet lists "5 Netflix €17.99 Paid 5 Nov", "8 Disney+
  €11.99 Paid 9 Nov" and "21 Spotify €10.99 In 2 days", once, without
  editable lines

#### Scenario: Add a bill
- **WHEN** the user chooses Edit bills, adds "Spotify", day 21, 10.99 to
  "Streaming" and saves
- **THEN** "Streaming" has three bills and a budget of 40.97 a month

#### Scenario: A loan category has no prompts
- **WHEN** a payment of "Mortgage" is 35.00 of insurance that pays no
  loan bill
- **THEN** the sheet shows no "To review" block and no Edit bills, and
  the bar shows the 35.00 over

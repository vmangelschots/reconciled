# yearly-budgets Specification

## Purpose
Yearly budgets let a category have an allowance per calendar year, or one
payment due on a date each year, instead of a monthly limit, and track
what has been spent against it since budgeting started.

## Requirements

### Requirement: Yearly budget
A category of the yearly kind SHALL have one amount per calendar year.
All of the category's spending in the year SHALL count against it,
whatever the month. Money not spent in one month SHALL stay available
for the rest of the same year, and SHALL NOT carry over to the next
year.

#### Scenario: Spending in any month counts
- **WHEN** "Clothing" has a yearly budget of 1200.00 and spent 300.00 in
  February and 500.00 in June
- **THEN** at the end of June "Clothing" shows 800.00 spent and 400.00
  left for the year

#### Scenario: A new year starts fresh
- **WHEN** "Clothing" had 400.00 left at the end of 2026
- **THEN** in January 2027 "Clothing" has its 1200.00 for 2027, not
  1600.00

#### Scenario: Added mid-year counts the whole year
- **WHEN** no start month applies to 2027 and the user gives "Gifts" a
  yearly budget of 1200.00 in June 2027, after spending 200.00 on gifts
  in March
- **THEN** "Gifts" has 1200.00 for 2027 with 200.00 spent

### Requirement: Yearly budget on a date
A category of the yearly-on-a-date kind SHALL have an amount and a due
date, given as a day and a month, that apply every year. The system
SHALL reject 29 February as a due date. All of the category's spending
in the calendar year SHALL count towards paying it.

#### Scenario: Set a target
- **WHEN** the user gives "Property tax" a yearly budget on a date of
  400.00 due on 1 November
- **THEN** "Property tax" expects 400.00 on 1 November of every year

#### Scenario: Reject 29 February
- **WHEN** the user sets a due date of 29 February
- **THEN** the system rejects it

### Requirement: Budgeting start month
The system SHALL let the user set one budgeting start month, or leave it
unset. Yearly and yearly-on-a-date budgets SHALL NOT count spending
dated before the start month. With no start month, every year counts in
full.

#### Scenario: Spending before the start is ignored
- **WHEN** the start month is October 2026 and "Clothing" has 250.00 of
  spending in August 2026 and 80.00 in October 2026
- **THEN** "Clothing" shows 80.00 spent in 2026

#### Scenario: No start month
- **WHEN** no start month is set and "Clothing" has a yearly budget of
  1200.00
- **THEN** 2026 counts all of 2026's "Clothing" spending against
  1200.00

#### Scenario: Monthly budgets are unaffected
- **WHEN** the start month is October 2026 and the user views September
  2026
- **THEN** monthly budgets show September's limits and spending as
  before

### Requirement: Start year is pro-rated
In the start month's year, a yearly budget SHALL be its amount times the
months from the start month through December, the start month included,
divided by 12 and rounded down to the cent. Later years SHALL use the
full amount. Years before the start month's year SHALL have no yearly
budgets. When a budget is pro-rated, its full amount and the start month
SHALL be shown with it.

#### Scenario: Starting in October
- **WHEN** the start month is October 2026 and "Clothing" has 1200.00 a
  year
- **THEN** "Clothing" has 300.00 for 2026, shown as "of 1,200 · from
  Oct", and 1200.00 for 2027

#### Scenario: Starting in June
- **WHEN** the start month is June 2027 and "Gifts" has 1200.00 a year
- **THEN** "Gifts" has 700.00 for 2027

#### Scenario: Rounded down to the cent
- **WHEN** the start month is November 2026 and "Gifts" has 1000.00 a
  year
- **THEN** "Gifts" has 166.66 for 2026

#### Scenario: Before the start year
- **WHEN** the start month is October 2026 and the user views a month in
  2025
- **THEN** no yearly budgets are shown for 2025

### Requirement: A target in the start year
A yearly budget on a date SHALL count in the start month's year only
when its due date falls on or after the first day of the start month.
It SHALL never be pro-rated.

#### Scenario: Due after the start
- **WHEN** the start month is October 2026 and "Property tax" is 400.00
  due on 1 November
- **THEN** "Property tax" expects the full 400.00 in 2026

#### Scenario: Due before the start
- **WHEN** the start month is October 2026 and "Car tax" is 250.00 due
  on 15 March
- **THEN** "Car tax" isn't expected in 2026, and is expected on 15 March
  2027

### Requirement: Editing a yearly amount
Changing a yearly budget's amount, or a target's amount or due date,
SHALL apply to the current calendar year and every later year. Earlier
years SHALL keep the values they had. The change SHALL apply to the
whole current year, not only the months after it. The editor SHALL say
which years the change applies to.

#### Scenario: Raise next year's budget
- **WHEN** "Clothing" was 1200.00 in 2026 and the user changes it to
  1500.00 in January 2027
- **THEN** 2027 uses 1500.00, and viewing December 2026 still shows
  2026's 1200.00 (300.00 from October)

#### Scenario: A change mid-year covers the whole year
- **WHEN** the user changes "Clothing" from 1200.00 to 1500.00 in June
  2027
- **THEN** all of 2027 uses 1500.00

#### Scenario: Moving a due date
- **WHEN** "Property tax" was due on 1 November in 2026 and the user
  moves it to 15 October in 2027
- **THEN** 2027 expects it on 15 October, and 2026 still expected it on
  1 November

#### Scenario: The editor states the scope
- **WHEN** on 5 January 2027 the user edits "Clothing" while viewing
  December 2026
- **THEN** the editor says the change applies to 2027 and later and that
  2026 stays 1200.00

### Requirement: Switching between yearly kinds keeps the budget
Switching a category between yearly and yearly on a date SHALL keep its
amount and its history. Switching to yearly on a date SHALL require a
due date. Switching to yearly SHALL drop the due date from the current
year on; earlier years keep theirs.

#### Scenario: Yearly to on a date
- **WHEN** "Property tax" is yearly with 400.00 since 2026 and the user
  switches it to yearly on a date, due 1 November, in 2027
- **THEN** it keeps 400.00 and its history, without asking for
  confirmation

#### Scenario: A due date is required
- **WHEN** the user switches "Property tax" to yearly on a date without
  a due date
- **THEN** the system rejects it

### Requirement: Amount history
The category settings SHALL show a yearly budget's history, read-only:
one line per year in which its values changed, newest first. Each line
SHALL show the amount, plus the due date for a target. The newest line
reads as applying from its year onward. More than one change in the same
year SHALL show as one line with the last values.

#### Scenario: Two years of history
- **WHEN** "Clothing" was set to 1200.00 in 2026 and changed to 1500.00
  in 2027
- **THEN** its history shows "2027 onward 1500.00" and "2026 1200.00"

#### Scenario: Several changes in one year
- **WHEN** the user changes "Clothing" to 1300.00 and then to 1500.00,
  both in 2027
- **THEN** the history shows one line for 2027 with 1500.00

#### Scenario: A single line is not a history
- **WHEN** "Clothing" has only been set in 2026
- **THEN** the category settings show its current amount without a
  history to open

### Requirement: This year on the Budgets page
The Budgets page SHALL show a "This year" section listing every yearly
and yearly-on-a-date budget for the viewed month's year, below the
monthly summary. Spending SHALL be counted from the later of 1 January
and the start month through the end of the viewed month, and the
section title SHALL say up to which day. Subcategories SHALL be grouped
under their parent, with independent figures.

#### Scenario: Viewing October
- **WHEN** on 24 October 2026, with the start month October 2026,
  "Clothing" has 1200.00 a year and spent 180.00 in October, and the
  user views October 2026
- **THEN** "This year (2026) · to 24 Oct" shows "Clothing" with 300.00
  budget, 180.00 spent and 120.00 left

#### Scenario: Viewing an earlier month of the year
- **WHEN** "Clothing" spent 180.00 in October and 90.00 in November
  2026, and the user views October 2026
- **THEN** the title says "to 31 Oct" and "Clothing" shows 180.00 spent,
  not 270.00

#### Scenario: Viewing a month before the start
- **WHEN** the start month is October 2026 and the user views September
  2026
- **THEN** the section says budgeting by year starts in October 2026 and
  offers to go to October 2026, instead of listing budgets

### Requirement: Start month on the Budgets page
The "This year" section SHALL show the start month and let the user set,
change or clear it.

#### Scenario: Set the start month
- **WHEN** the user sets the start month to October 2026
- **THEN** the section shows that yearly budgets count from October 2026
  and its figures are recalculated

#### Scenario: Clear the start month
- **WHEN** the user clears the start month
- **THEN** every year's yearly budgets count in full

### Requirement: Yearly runway and pace
When the current month is viewed, each yearly budget SHALL show what's
left per remaining month of the year, the current month included,
rounded down to whole euros, and a pace marker at the share of the
budgeted part of the year passed by the end of today. Over budget, it
SHALL show how much over instead. Other months SHALL show neither.

#### Scenario: Runway in October
- **WHEN** on 24 October 2026 "Clothing" has 120.00 left for 2026
- **THEN** it shows "€40 a month to Dec"

#### Scenario: Pace from the start month
- **WHEN** the start month is October 2026 and today is 31 October 2026
- **THEN** the pace marker sits at 31 of the 92 days from 1 October to
  31 December (33%)

#### Scenario: Over for the year
- **WHEN** "Clothing" has spent 330.00 of its 300.00 for 2026
- **THEN** it shows "€30 over for 2026" instead of a runway

#### Scenario: No runway for a past month
- **WHEN** the user views a month before the current one
- **THEN** yearly budgets show budget, spent and left without a runway or
  pace marker

### Requirement: Yearly budget ahead of pace
When the current month is viewed, a yearly budget at 85% or more of its
budget for the year, and ahead of the year's pace, SHALL be shown as
running ahead on the Budgets page. Shares SHALL be rounded down.

#### Scenario: Running ahead
- **WHEN** on 24 October 2026, with the start month October 2026,
  "Clothing" has spent 270.00 of 300.00
- **THEN** its bar shows it running ahead, because 90% is ahead of the
  26% of the budgeted year passed

### Requirement: Target paid within tolerance
A target SHALL count as paid when its spending in the year is within the
tolerance of its amount: the larger of 5% of the amount and 10.00. A
difference within the tolerance SHALL be shown as a note, not a warning.

#### Scenario: Slightly under
- **WHEN** "Property tax" is 400.00 and 398.12 was spent on it
- **THEN** it shows paid, €1.88 under

#### Scenario: The tolerance has a floor
- **WHEN** "Water tax" is 120.00 and 129.00 was spent on it
- **THEN** it shows paid, €9 over, since 10.00 is more than 5% of 120.00

### Requirement: Target states
A target SHALL show one state as of its reference day: today for the
current month, the viewed month's last day otherwise. Paid and paid over
follow from the tolerance. Otherwise: due soon within 14 days up to the
due date, upcoming before that; in the 7 days after it, not seen yet;
later, overdue with nothing spent or partly paid with the shortfall.

#### Scenario: Due soon
- **WHEN** on 24 October "Property tax" is 400.00 due on 1 November and
  nothing has been spent
- **THEN** it shows "due 1 Nov, in 8 days"

#### Scenario: Paid early
- **WHEN** 400.00 was spent on "Property tax" on 20 October, before its
  1 November due date
- **THEN** it shows paid

#### Scenario: Not seen yet
- **WHEN** on 4 November nothing has been spent on "Property tax", due
  on 1 November
- **THEN** it shows "due 1 Nov, not seen yet"

#### Scenario: Overdue
- **WHEN** on 9 November nothing has been spent on "Property tax", due
  on 1 November
- **THEN** it shows overdue since 1 November

#### Scenario: Paid over
- **WHEN** "Property tax" is 400.00 and 450.00 was spent on it
- **THEN** it shows paid, €50 over

#### Scenario: Partly paid
- **WHEN** on 9 November 300.00 has been spent on "Property tax" of
  400.00
- **THEN** it shows partly paid, €100 short

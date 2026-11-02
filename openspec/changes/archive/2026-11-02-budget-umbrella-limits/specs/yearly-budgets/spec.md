## MODIFIED Requirements

### Requirement: Yearly budget
A category of the yearly kind SHALL have one amount per calendar year.
All of the category's spending in the year, including that of its
subcategories whatever their budget kind, SHALL count against it, whatever
the month. Money not spent in one month SHALL stay available for the rest
of the same year, and SHALL NOT carry over to the next year.

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

#### Scenario: Subcategories count against a yearly parent
- **WHEN** "Holidays" has a yearly budget of 2000.00 and spent 300.00
  directly, 500.00 in its yearly subcategory "Flights" and 40.00 in its
  monthly subcategory "Parking"
- **THEN** "Holidays" shows 840.00 spent and 1160.00 left, and "Flights"
  shows its own 500.00

### Requirement: Yearly budget on a date
A category of the yearly-on-a-date kind SHALL have an amount and a due
date, given as a day and a month, that apply every year. The system
SHALL reject 29 February as a due date. All of the category's spending
in the calendar year, including that of its subcategories, SHALL count
towards paying it.

#### Scenario: Set a target
- **WHEN** the user gives "Property tax" a yearly budget on a date of
  400.00 due on 1 November
- **THEN** "Property tax" expects 400.00 on 1 November of every year

#### Scenario: Reject 29 February
- **WHEN** the user sets a due date of 29 February
- **THEN** the system rejects it

#### Scenario: A subcategory's spending pays the target
- **WHEN** "Property tax" is 400.00 and its subcategory "Instalments" spent
  400.00 this year
- **THEN** "Property tax" shows paid

### Requirement: This year on the Budgets page
The Budgets page SHALL show a "This year" section listing every yearly
and yearly-on-a-date budget for the viewed month's year, below the
monthly summary. Spending SHALL be counted from the later of 1 January
and the start month through the end of the viewed month, and the
section title SHALL say up to which day. Subcategories SHALL be grouped
under their parent, and a parent's figures SHALL include them.

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

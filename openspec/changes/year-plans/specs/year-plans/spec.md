# Spec Delta

## Purpose

Year plans let the user see a calendar year's income against all its
budgets, try out other budgets in drafts without touching the real one,
and apply a draft as the real budget from a chosen month on.

## ADDED Requirements

### Requirement: Year view
The Budgets page's Year view SHALL show one calendar year with a year
switcher, the year's plans as chips, and the selected plan's headline and
rows. The switcher SHALL go back to the first year with transactions or
budgets, and forward to next year in local time, not further.

#### Scenario: Planning next year
- **WHEN** on 16 November 2026 the user opens the Year view
- **THEN** it shows 2026, and the year switcher's next control goes to 2027
  and is then disabled

#### Scenario: The address holds the year and plan
- **WHEN** the user opens draft "Lean" of 2027
- **THEN** the address names the Year view, 2027 and that draft, so a link
  opens it there

### Requirement: Current budget plan
Every year SHALL have a Current budget plan, read from the real budget for
that year and always up to date with it. It SHALL be the first chip and
SHALL open by default. In the Year view, Current SHALL be read-only: the
real budget changes only through the month view or by applying a draft.

#### Scenario: Current follows the real budget
- **WHEN** the user sets "Groceries" to 650.00 in the month view and opens
  the Year view
- **THEN** Current shows "Groceries" at 650.00 a month

#### Scenario: Opening a row in Current
- **WHEN** the user opens "Groceries" from Current 2027
- **THEN** the sheet shows its year figures without an editor, and offers
  "Change in a new draft" and "Open in month view"

### Requirement: Change in a new draft
"Change in a new draft" SHALL create a draft of that year copied from
Current, with the default name and from month, and open the same category
in it, ready to edit.

#### Scenario: From Current to a draft
- **WHEN** the user chooses "Change in a new draft" on "Groceries" in
  Current 2027
- **THEN** draft "2027 plan" is created from January and its "Groceries"
  sheet opens with the editor

### Requirement: Drafts
The user SHALL be able to create any number of drafts of the current or
a future year, as a copy of Current or of another draft of that year. A
new draft SHALL be named "<year> plan", or "Rest of <year>" when it starts
after January, and can be renamed. A draft SHALL NOT change the real budget
until applied. Its chip menu SHALL offer rename, duplicate and delete.

#### Scenario: New draft from Current
- **WHEN** the user chooses New draft on Current 2027
- **THEN** draft "2027 plan" opens with the same budgets and income as
  Current

#### Scenario: A draft doesn't touch the budget
- **WHEN** the user sets "Groceries" to 500.00 in draft "2027 plan"
- **THEN** the month view, Overview, warnings and Forecast still use the
  real budget's amount

#### Scenario: Delete a draft
- **WHEN** the user deletes draft "Lean" from its menu and confirms
- **THEN** the draft is gone and Current opens

#### Scenario: No drafts of a past year
- **WHEN** the user views 2025
- **THEN** only Current and History show, without New draft

### Requirement: Chips
The chip row SHALL show Current first, then the year's drafts, most
recently changed first, then New draft and History. It SHALL scroll
sideways when the drafts don't fit. Applied drafts SHALL NOT be chips.

#### Scenario: Several drafts
- **WHEN** 2027 has drafts "Lean" and "New car", and "New car" changed last
- **THEN** the chips read Current, New car, Lean, New draft, History

### Requirement: A draft is unmistakable
While a draft is open, the page behind its panels SHALL be tinted, under a
bar that stays in view, saying the draft's name, that it is not the budget
yet, its from month, and offering Apply. A budget sheet opened from a draft
SHALL say it edits that draft, and its save action SHALL read Save to draft.
Current SHALL show neither.

#### Scenario: Editing in a draft
- **WHEN** the user opens "Groceries" in draft "Lean"
- **THEN** the sheet says "Editing draft Lean" and its button reads "Save to
  draft"

#### Scenario: Current has no draft bar
- **WHEN** Current is open
- **THEN** no draft bar or tint is shown

### Requirement: What a draft can change
A draft SHALL let the user change everything the budget editor can for a
category: its kind, amount, due date, bills, month exceptions, giving it
a budget and removing it. A loan category SHALL be locked to its loans in
a draft as in the real budget. Tabs SHALL NOT be listed.

#### Scenario: Remove a budget in a draft
- **WHEN** in draft "Lean" the user removes the budget of "Hobbies"
- **THEN** the draft lists "Hobbies" without a budget, and the real budget
  keeps it

#### Scenario: A loan in a draft
- **WHEN** the user opens "House A" in a draft
- **THEN** it shows its installments as locked, with a link to the loan's
  schedule, and no editor

### Requirement: A kind switch warns in the draft
Switching a category's kind in a draft SHALL warn in the sheet that
applying the draft changes the kind for every month, earlier ones
included, and says what that removes.

#### Scenario: Holidays to yearly
- **WHEN** in draft "Lean" the user switches "Holidays" from monthly 250.00
  to yearly 3,000.00
- **THEN** the sheet warns that applying makes "Holidays" yearly for every
  month, earlier ones included, and its monthly limits go, and the real
  budget keeps it monthly

### Requirement: Month exceptions in a draft
A monthly budget in a draft SHALL have one amount, with "Different amount
in some months" opening the twelve months of the year. A month whose amount
differs from the default SHALL be an exception, marked, with a reset. A
month typed equal to the default SHALL stop being one. Changing the default
SHALL keep the exceptions' amounts.

#### Scenario: December groceries
- **WHEN** in a draft "Groceries" is 600.00 and the user opens the months
  and enters 800 for December
- **THEN** December is marked as an exception, and the year plan is 7,400.00

#### Scenario: Back to the default
- **WHEN** the user resets December
- **THEN** December uses 600.00 again and isn't marked

### Requirement: Bills in a draft
A bill in a draft SHALL have the month of the year it starts in, and SHALL
either keep going or end in a month of that year. A new bill SHALL start
in the draft's from month and keep going.

#### Scenario: A contract ending in December
- **WHEN** in a draft the user sets "Gym" to end in December
- **THEN** applying the draft ends "Gym" after December, and the next year
  has no "Gym" bill

### Requirement: Adding a category from a plan
A draft SHALL offer Add category, which creates a real category without a
budget and opens it in the draft. The dialog SHALL say the category is
added to the categories now and stays if the draft is deleted, while its
budget lives in the draft.

#### Scenario: Car fund
- **WHEN** in draft "Lean" the user adds category "Car fund" and gives it
  a yearly 2,400.00
- **THEN** "Car fund" exists in the category settings without a budget,
  and only draft "Lean" gives it 2,400.00

### Requirement: A draft's from month
A draft SHALL have a from month in its year: January for a future year,
next month by default for the current year, and changeable in the draft
bar. Months before it SHALL show the real budget and SHALL NOT be editable
in the draft. A draft of a past year SHALL be read-only.

#### Scenario: Correcting in June
- **WHEN** on 14 June 2027 the user makes a new draft of 2027
- **THEN** it is named "Rest of 2027", its from month is July, and its month
  exceptions can only be set for July to December

#### Scenario: Earlier months stay real
- **WHEN** a draft from July sets "Groceries" to 550.00 and the real
  default is 650.00
- **THEN** "Groceries" plans 6 x 650.00 + 6 x 550.00 = 7,200.00 for 2027

### Requirement: Moving the from month
Moving a draft's from month earlier SHALL fill the months it now covers
with Current's values. Moving it later SHALL keep the draft's values for
the months it no longer covers, shown greyed with a note that they won't
apply, and moving back SHALL restore them.

#### Scenario: From July to September
- **WHEN** a draft from July has 900.00 for August and its from month moves
  to September
- **THEN** August shows the real budget, and the draft notes that August's
  900 won't apply

#### Scenario: From July to May
- **WHEN** the from month moves from July to May
- **THEN** May and June take Current's values

### Requirement: Income lines
A plan SHALL hold income lines, each with a name, an amount per month or
per year, optional one-off amounts in given months, and optionally an
income category for its actual figure. Income SHALL exist in plans only:
nothing tracks it during the month, and Current SHALL mark it as plan only.

#### Scenario: Salary with holiday pay and a 13th month
- **WHEN** "Salary" is 3,200.00 a month with 2,900.00 extra in May and
  3,200.00 extra in December
- **THEN** it plans 44,500.00 for the year

#### Scenario: Plan only on Current
- **WHEN** Current is open
- **THEN** the Income section is marked plan only, not a budget

#### Scenario: Income on Current is edited directly
- **WHEN** the user adds an income line on Current
- **THEN** it is saved for that year without a draft, since income isn't
  part of the real budget

### Requirement: Income suggestions
A plan without income lines SHALL suggest lines from the forecast's
expected income items, then from income categories over the last 12
complete months that no suggested item already covers, each with Add,
plus Add all. Nothing SHALL be added without the user choosing it.
Without suggestions it SHALL offer Add income line with an example.

#### Scenario: Start from the forecast
- **WHEN** the forecast expects "Salary" 3,200.00 in on the 25th,
  recognised by "Income", and "Income" took in 41,200.00 over the last 12
  months
- **THEN** the empty Income section suggests "Salary 3,200 a month" only

#### Scenario: A category the forecast doesn't cover
- **WHEN** "Side job" took in 2,400.00 over the last 12 months and no
  expected item is recognised by it
- **THEN** it is suggested as "Side job 2,400 a year"

#### Scenario: Nothing to suggest
- **WHEN** there are no expected income items or income categories
- **THEN** the section offers Add income line, with "Salary, 3,200 a month"
  as its example

### Requirement: A budget's year total
A row's plan for the year SHALL be: for a monthly budget, the sum of its
twelve months, each its exception or else its default; for Bills, the
bills that count in each month; for a loan category, its installments
dated in the year; for a yearly budget, its amount, pro-rated in the
start month's year; for a target, its amount when it counts that year.

#### Scenario: Monthly with a December exception
- **WHEN** "Groceries" is 600.00 a month with 800.00 for December
- **THEN** its year plan is 7,400.00, shown with 600 a month

#### Scenario: A bill ending in March
- **WHEN** a Bills category has 40.00 that ends in March and 15.00 all year
- **THEN** its year plan is 3 x 40.00 + 12 x 15.00 = 300.00

### Requirement: Year totals
The headline SHALL lead with what's left to save for the year and its share
of income, with a bar splitting income into expenses and left to save, and
a line with expenses and their actual figure. Expenses SHALL count each
top-level budget once, including its subcategories' caps, and a
subcategory's own budget only under a parent without one.

#### Scenario: Left to save
- **WHEN** income is 42,600.00 and expenses 38,900.00
- **THEN** the headline shows "€3,700 left to save · 9% of €42,600 income"

#### Scenario: Caps aren't counted twice
- **WHEN** "Food" plans 9,600.00 and its subcategory "Takeaway" a cap of
  1,200.00
- **THEN** expenses count 9,600.00 for them

#### Scenario: Over income
- **WHEN** expenses are 44,000.00 and income 42,600.00
- **THEN** the headline shows "€1,400 short" and the bar's excess is in the
  critical colour

### Requirement: A plan without income or budgets
Without income lines, the headline SHALL show the year's expenses and
"Add income to see what's left to save", leading to the suggestions. With
no budgets and no income lines either, the Year view SHALL say so and link
to the month view to set a first budget.

#### Scenario: First visit to 2027
- **WHEN** 2027 has budgets totalling 38,900.00 and no income lines
- **THEN** the headline shows "€38,900 planned expenses" and "Add income to
  see what's left to save", not a negative amount

#### Scenario: Nothing yet
- **WHEN** the household has no budgets and no income lines
- **THEN** the Year view says there is nothing to plan yet, with a link to
  the month view

### Requirement: Actual figures
Each row and total SHALL show an Actual figure: for a future year, over
the last 12 complete months, with the column header naming them; for the
current year, so far this year; for a past year, the whole year. Spending
SHALL be counted as in the month view, income as the line category's net
inflow.

#### Scenario: Planning 2027 in November
- **WHEN** on 16 November 2026 the user opens a 2027 plan
- **THEN** the Actual column's header reads "Last 12 mo (Nov–Oct)"

#### Scenario: An income line without a category
- **WHEN** "Gift from parents" has no category
- **THEN** its Actual shows a dash

### Requirement: Spending outside the plan
The rows SHALL end with the Actual spending of categories without a budget
in the plan and of uncategorized transactions, without a plan figure, so
the year doesn't look better than it is.

#### Scenario: No budget last year
- **WHEN** categories without a budget spent 3,100.00 over the last 12
  months
- **THEN** a "Not in the plan" row shows 3,100.00 actual

### Requirement: Where the current year is heading
For the current year, the headline SHALL also show where the year is
heading: income and spending so far plus the plan for the remaining months,
and left to save at that pace. An income line without a category SHALL
count its plan. Rows SHALL show the months so far and still to come,
labelled "So far" and "Still to come".

#### Scenario: Heading for in June
- **WHEN** on 14 June the plan leaves 3,700.00 to save but spending ran
  1,200.00 over the plan so far
- **THEN** the headline shows "Heading for €2,500 left to save"

### Requirement: Changes against Current
In a draft, each row that differs from Current SHALL be marked and show
Current's value struck through above the draft's, and a Change column
with the difference, blank when there is none. The headline SHALL show
left to save's difference with Current.

#### Scenario: Groceries lowered
- **WHEN** draft "Lean" plans "Groceries" at 7,200.00 and Current 7,800.00
- **THEN** the row shows 7,800 struck through above 7,200, and -600 under
  Change

#### Scenario: An unchanged row
- **WHEN** "Utilities" is the same in the draft and Current
- **THEN** its Change is blank and it isn't marked

### Requirement: Changed in the budget since copied
A draft SHALL mark a row whose real budget changed after the draft was
copied, saying from and to what, while keeping the draft's value, and
offer to use the budget's new value instead.

#### Scenario: Transport changed meanwhile
- **WHEN** draft "Lean" was copied with "Transport" at 120.00 and the
  real budget then became 140.00, while the draft keeps 120.00
- **THEN** the row says the budget changed from 120 to 140 since the copy,
  with "Use 140"

#### Scenario: Use the new value
- **WHEN** the user chooses "Use 140"
- **THEN** the draft's "Transport" is 140.00 and the row isn't marked any more

### Requirement: Apply preview
Apply SHALL open a dialog with the from month and every change to the real
budget from that month on. Kind switches SHALL come first, in the warning
colour, saying what they remove, before amounts, bills added or ended,
month exceptions set or replaced, budgets given or removed, income lines,
and rows changed since the copy. Nothing changes until confirmed.

#### Scenario: Previewing Lean
- **WHEN** the user chooses Apply on draft "Lean" from January 2027
- **THEN** the dialog first warns "Holidays becomes yearly 3,000 for every
  month, earlier ones included; its monthly limits go", then lists
  "Groceries 650 -> 600 a month", "Streaming +1 bill" and "Transport: the
  draft keeps 120, the budget has 140 now"

#### Scenario: Cancel
- **WHEN** the user cancels the dialog
- **THEN** nothing changes

#### Scenario: Nothing to apply
- **WHEN** a draft matches the real budget from its from month and its
  income matches Current's
- **THEN** the dialog says there is nothing to apply, and confirming is not
  offered

### Requirement: Applying a draft
Confirming SHALL make the real budget from the from month on match the
draft: its defaults, its month exceptions replacing existing ones, its
bills, kinds and yearly amounts. Months before the from month SHALL keep
their limits, exceptions and bills, except where a kind switch removes
them. The draft's income SHALL become Current's for the year.

#### Scenario: Applied from July
- **WHEN** draft "Rest of 2027" from July with "Groceries" at 550.00 is
  applied and the default was 650.00
- **THEN** January to June 2027 keep 650.00, and July on is 550.00

#### Scenario: An exception replaced
- **WHEN** the real budget has 900.00 for December and the applied draft
  has 800.00 for December
- **THEN** December's limit is 800.00

#### Scenario: Next year's draft applied in November
- **WHEN** draft "Lean" of 2027, which switches no kinds, is applied on 20
  November 2026
- **THEN** November and December 2026 keep their budget, and 2027 is
  "Lean"

### Requirement: After applying
After a successful apply, the Year view SHALL show Current, with a toast
saying which draft was applied from which month and linking to that month
in the month view. If applying fails, nothing SHALL change and the dialog
SHALL stay open with the error.

#### Scenario: Lean applied
- **WHEN** the user confirms applying "Lean" from January 2027
- **THEN** Current 2027 opens, matching "Lean", with the toast "Lean applied
  from January 2027" and "Open January"

#### Scenario: A failed apply
- **WHEN** the server refuses the apply
- **THEN** the real budget is unchanged and the dialog shows the error

### Requirement: Kind switches apply to the whole category
A kind switch in an applied draft SHALL apply as switching kind does in
the budget editor, for every month, so it can remove amounts of months
before the from month and of earlier years.

#### Scenario: Monthly to yearly in July
- **WHEN** a draft from July switches "Holidays" from monthly to yearly
  3,000.00 and is applied
- **THEN** all 2027 spending on "Holidays" counts against 3,000.00, and its
  monthly limits are gone

### Requirement: Applying in a part-spent month
When the from month is the current month, Apply SHALL warn that the month
is under way, with how much its changed categories have spent so far.

#### Scenario: From this month
- **WHEN** on 14 June the user sets the from month to June, and the changed
  categories have spent 420.00 in June
- **THEN** the dialog warns "June is under way. €420 already spent counts
  against the new amounts."

### Requirement: Applied drafts are kept
An applied draft SHALL be kept read-only, stamped with when it was applied
and from which month, and listed under History. It SHALL be duplicated
into a new draft, not edited.

#### Scenario: The record
- **WHEN** draft "Rest of 2027" was applied on 12 June 2027 from July
- **THEN** History lists "Rest of 2027 - applied 12 Jun, from July", which
  opens greyed and read-only, with Duplicate

### Requirement: Drafts never feed other pages
The Forecast, Overview, Needs attention, the month view and reports SHALL
use the real budget only. Drafts and income lines SHALL NOT change them.

#### Scenario: Forecast
- **WHEN** draft "Lean" lowers "Groceries" for 2027
- **THEN** the Forecast still spreads the real "Groceries" limit

### Requirement: Year plans on a phone
On a phone, the chips SHALL scroll sideways, the draft bar SHALL sit above
the tab bar with notifications above it, and each row SHALL show its name,
its plan and one second figure: Change in a draft, Actual on Current and
applied drafts.

#### Scenario: A draft on a phone
- **WHEN** on a phone the user opens draft "Lean"
- **THEN** each row shows its plan and its Change, and the draft bar sits
  above the tab bar

#### Scenario: A toast in a draft
- **WHEN** a toast shows while a draft is open on a phone
- **THEN** it appears above the draft bar

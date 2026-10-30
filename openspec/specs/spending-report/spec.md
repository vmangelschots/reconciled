# spending-report Specification

## Purpose

A profit and loss report: what came in and what went out per month per
category over a period, what was left, and the transactions behind each
figure.

## Requirements

### Requirement: Report period
The Reports page SHALL offer the periods 12 months, This year, Last year
and Custom, opening on 12 months. A period SHALL be whole months and be
kept in the page's URL. 12 months SHALL be the last 12 complete months.
This year SHALL run from January to the current month.

#### Scenario: Default period
- **WHEN** the user opens Reports in October 2026
- **THEN** the period is October 2025 to September 2026

#### Scenario: Reload keeps the period
- **WHEN** the user picks Last year and reloads the page
- **THEN** Last year is still shown

### Requirement: Custom period limits
A custom period SHALL run from one month to another of at most 24 months,
not past the current month. The picker SHALL disable months that break
this. The API SHALL reject a longer or malformed period, and the page
SHALL treat a bad period in its URL as the default.

#### Scenario: Too long
- **WHEN** a period of 25 months is requested
- **THEN** it is rejected with an error

#### Scenario: A bad URL
- **WHEN** the page opens with a malformed period in its URL
- **THEN** it shows the default period

### Requirement: Period starts with the data
A period SHALL start no earlier than the month of the first transaction,
and no month before it SHALL be shown or counted.

#### Scenario: Data starts in March
- **WHEN** the first transaction is in March 2026 and the period is the
  last 12 complete months
- **THEN** the report shows March to September 2026

### Requirement: Report counts all accounts
The report SHALL count every account, archived ones included. Transfers
between the user's accounts, tab rows and value adjustments SHALL NOT
count, and a split transaction SHALL count through its parts.

#### Scenario: Spending on a closed card
- **WHEN** an archived credit card had -80.00 of "Clothing" in March
- **THEN** March reports 80.00 for "Clothing"

### Requirement: Spending per month per category
Each month SHALL report each category's net outflow, so refunds reduce it
and a month can be negative. A parent's figure SHALL include its
subcategories. "Uncategorized" SHALL count outflows only. A category with
no non-zero month in the period SHALL be left out.

#### Scenario: Refund bigger than spending
- **WHEN** "Home" has -20.00 and a refund of +55.00 in March, and -100.00
  in April
- **THEN** "Home" reports -35.00 for March and 100.00 for April

### Requirement: Income categories
A top-level category whose total over the period is a net inflow SHALL
count as income, with its subcategories, and SHALL NOT count as spending.
Its figures SHALL show money in as positive. Which section a category is in
SHALL depend only on the period's total.

#### Scenario: Salary
- **WHEN** "Income" has +3,200.00 each month
- **THEN** it is listed as income with 3,200.00 a month, and not as spending

#### Scenario: Refunds beat spending over the period
- **WHEN** "Home" has -1,000.00 and refunds of +1,200.00 over the period
- **THEN** it is listed as income with a total of 200.00

### Requirement: Uncategorized money in
Uncategorized inflows SHALL be listed under income as "Uncategorized
income". Uncategorized outflows stay under spending as "Uncategorized".

#### Scenario: Both directions
- **WHEN** March has an uncategorized +500.00 and an uncategorized -40.00
- **THEN** "Uncategorized income" reports 500.00 and "Uncategorized" 40.00

### Requirement: Spending chart
The Reports page SHALL show one stacked bar per month of spending, oldest
on the left, of the 6 largest spending categories plus Other and Uncategorized,
each keeping one colour and one place in the stack in every month. A
category's negative month SHALL show below zero.

#### Scenario: Nine categories
- **WHEN** the period has spending in nine categories and uncategorized
  spending
- **THEN** each bar shows the six largest over the period, Other with the
  remaining three, and Uncategorized on top

#### Scenario: Hover a month
- **WHEN** the user hovers a month's bar
- **THEN** a tooltip lists that month's categories and total, and that
  month's column is highlighted in the table

### Requirement: Isolating a category
Selecting a category in the legend SHALL show only that category, starting
from zero, and selecting it again SHALL show all of them. The table SHALL
NOT be filtered. Hovering a table row SHALL dim the chart's other
categories, using the row's parent or Other when it has no segment.

#### Scenario: Isolate Groceries
- **WHEN** the user selects "Groceries" in the legend
- **THEN** the bars show only "Groceries", and the table is unchanged

#### Scenario: Hover a row without a segment
- **WHEN** the user hovers the "Supermarket" row under "Groceries"
- **THEN** the chart dims everything except "Groceries"

### Requirement: Profit and loss table
The Reports page SHALL show a table with an Income section, then an
Expenses section: a row per category, largest total first, uncategorized
last, a column per month, then Total and Avg, and a Total income or Total
expenses row closing each. A section without rows SHALL be left out.
Amounts SHALL be whole euros, a zero a muted dash, and a negative a minus
amount in the normal text colour.

#### Scenario: Totals add up
- **WHEN** "Groceries" spent 412.00 in September and 388.00 in October in
  a two-month period
- **THEN** its Total is €800, and Total expenses sums each column

#### Scenario: Both sections
- **WHEN** the period has salary and spending
- **THEN** the table lists Income with Total income, then Expenses with
  Total expenses, then Net and Savings rate

### Requirement: Subcategories in the table
A parent with spending in subcategories SHALL expand into a row for each,
plus "<Parent> (direct)" when spending on the parent itself isn't zero.
Parents SHALL start collapsed; a parent with neither SHALL NOT expand.

#### Scenario: Expand a parent
- **WHEN** the user expands "Groceries" with spending on "Supermarket" and
  directly on "Groceries"
- **THEN** rows for "Supermarket" and "Groceries (direct)" appear, adding
  up to the parent row

### Requirement: Average per month
Avg SHALL be the total over the full months of the period, divided by
their number, counting months without spending. The current month, and
the first month of data when its first transaction is after the 5th,
SHALL NOT be full months, though they count in Total. With fewer than two
full months, Avg SHALL show a dash.

#### Scenario: A month without spending counts
- **WHEN** "Gifts" spent 120.00 in one of 12 full months
- **THEN** its Avg is €10

#### Scenario: Current month is left out
- **WHEN** the period is This year in October
- **THEN** Avg covers January to September, the header says "9 full
  months", and October is marked "so far"

#### Scenario: Too little data
- **WHEN** the period has one full month
- **THEN** Avg shows a dash

### Requirement: Net and savings rate
Closing the table the page SHALL show per month, and in Total and Avg: Net
(Total income minus Total expenses) and Savings rate (Net as a share of
Total income). The rate SHALL show a dash when Total income isn't
positive, and in the Avg column.

#### Scenario: A month's figures
- **WHEN** a month has 2,900.00 of salary, and 2,000.00 of "Home" with a
  100.00 refund
- **THEN** Total expenses is 1,900.00, Total income 2,900.00, Net 1,000.00
  and Savings rate 34%

### Requirement: Period summary
Under its title the page SHALL state the period and what it covers, then
a line with the period's spending, income and savings rate.

#### Scenario: Summary line
- **WHEN** the period spent 21,400.00 of 26,100.00 income
- **THEN** the page says "Spent €21,400 · Income €26,100 · Saved 18%"

### Requirement: Uncategorized warning
When more than 10% of the period's spending is uncategorized, the page
SHALL say how much and link to Review.

#### Scenario: Large uncategorized share
- **WHEN** 620.00 of 4,400.00 is uncategorized
- **THEN** the page says "€620 uncategorized (14%)" with a link to Review

### Requirement: Transactions behind a figure
Selecting a non-zero month cell of a category row, or a chart segment,
SHALL open a sheet of the rows behind it: the figure's own direction
largest first, then the opposite one. Money in SHALL show a "+" in the
positive colour. Its header SHALL show the category, month, figure, count
and accounts. The rows SHALL add up to the figure. A split SHALL list only
the counted part and its full amount.

#### Scenario: A parent's cell
- **WHEN** the user selects "Groceries" for September
- **THEN** the sheet lists the rows in "Groceries" and its subcategories,
  across all accounts, adding up to the cell

#### Scenario: A part of a split
- **WHEN** a -60.00 transaction has a -40.00 part in "Groceries"
- **THEN** the sheet lists -40.00 and says it is part of 60.00

#### Scenario: Other in the chart
- **WHEN** the user selects the Other segment
- **THEN** it isolates Other, and no sheet opens

#### Scenario: An income cell
- **WHEN** the user selects "Income" for September
- **THEN** the sheet lists the money in, largest first, adding up to the
  cell

#### Scenario: Cells that open nothing
- **WHEN** the user selects a zero cell, a Total or Avg cell, or a cell of
  a total, Net or Savings rate row
- **THEN** no sheet opens

#### Scenario: Touch on the chart
- **WHEN** the user taps a segment below 1024px
- **THEN** the tooltip shows, no sheet opens, and table cells still open it

#### Scenario: Sheet loading and errors
- **WHEN** the sheet's rows are loading, or fail to load
- **THEN** the sheet shows a placeholder, or an error with a notification,
  and the report behind it stays as it was

### Requirement: Fixing a category from the sheet
The sheet SHALL let the user change an unsplit transaction's category with
the searchable category picker. A row SHALL leave the sheet only if it no
longer belongs to the figure. The report and the Review count SHALL then
refresh without going blank. Each row SHALL link to its account's ledger
on that month.

#### Scenario: Recategorise a row
- **WHEN** the user moves a row from "Groceries" to "Household"
- **THEN** the row leaves the sheet, and the table's figures update with
  the old figures staying visible until then

#### Scenario: A move within the parent
- **WHEN** the sheet shows "Groceries" and the user moves a row to its
  subcategory "Supermarket"
- **THEN** the row stays and shows its new category

#### Scenario: A failed save
- **WHEN** saving a new category fails
- **THEN** the row shows its old category, and a notification says so

#### Scenario: The last row leaves
- **WHEN** the user moves the sheet's only row elsewhere
- **THEN** the sheet says "Nothing left here"

#### Scenario: Uncategorized
- **WHEN** the sheet shows Uncategorized
- **THEN** it also links to Review

#### Scenario: Fixing a split
- **WHEN** the user follows the link on a split's row for September
- **THEN** that account's ledger opens filtered to September

### Requirement: Reports on a phone
Below 1024px, the table SHALL keep its category column in place, with
Total and Avg first and then months newest first, scrolling sideways. Wide
screens SHALL show months oldest first. The sheet SHALL open from the
bottom on a phone and from the side on a wide screen.

#### Scenario: Phone table
- **WHEN** the page is shown 390px wide
- **THEN** the first screen of the table shows category, Total and Avg,
  and the page itself doesn't scroll sideways

### Requirement: Reports with little or no data
The page SHALL never pad a period with empty months. Without accounts it
SHALL link to Accounts, and without transactions offer Import. When the
default period is empty it SHALL show the current month and say the report
is useful after the first full month. Another empty period SHALL say "No
data in this period".

#### Scenario: No transactions
- **WHEN** there are no transactions
- **THEN** the page offers Import instead of a chart

#### Scenario: No accounts
- **WHEN** there are no accounts
- **THEN** the page links to Accounts

#### Scenario: First weeks
- **WHEN** all transactions are from the current month and the default
  period is open
- **THEN** one bar and the month so far are shown, with the note

#### Scenario: An empty chosen period
- **WHEN** the user picks Last year and it holds no transactions
- **THEN** the page says "No data in this period"

### Requirement: Reports loading and errors
While the report first loads, the page SHALL show placeholders. Changing
the period SHALL keep the old figures dimmed until the new ones arrive.
When a load fails, the page SHALL say so and show an error notification.

#### Scenario: Change period
- **WHEN** the user switches from 12 months to Last year
- **THEN** the previous figures stay, dimmed, until the new ones arrive

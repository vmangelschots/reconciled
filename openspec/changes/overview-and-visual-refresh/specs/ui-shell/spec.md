# Spec Delta

## MODIFIED Requirements

### Requirement: Responsive navigation
The system SHALL show the primary navigation as a sidebar on wide
viewports and as a bottom tab bar on narrow viewports, rather than
letting it overflow. The sidebar SHALL list Overview, Transactions,
Review, Budgets and Forecast, then Import and Accounts as a second
group, with the overview account's balance, the theme toggle and sign
out in its footer. The tab bar SHALL show Overview, Transactions,
Review, Budgets and More, where More opens the remaining links, the
theme toggle and sign out, and its items SHALL stay centred at a phone's
width on wider screens. Review SHALL show its waiting count in both.
Notifications SHALL appear above the tab bar, not over it.

#### Scenario: Wide viewport shows navigation inline
- **WHEN** the viewport is at least 1024px wide
- **THEN** every navigation link is visible in the sidebar, and the
  sidebar footer shows the overview account's balance

#### Scenario: Narrow viewport collapses navigation
- **WHEN** the viewport is narrower than 1024px
- **THEN** a bottom tab bar shows Overview, Transactions, Review, Budgets
  and More, and opening More reveals Forecast, Import, Accounts, the
  theme toggle and sign out

#### Scenario: Tablet width keeps the tab bar compact
- **WHEN** the viewport is 800px wide
- **THEN** the tab bar's items are centred in a phone-width row rather
  than spread across the screen

#### Scenario: The current page is marked
- **WHEN** the user is on Budgets
- **THEN** Budgets is marked as current in the sidebar or tab bar

## ADDED Requirements

### Requirement: Page header
Every page SHALL start with a header that shows its title, and, where
the page has them, its month switcher, its account picker and its
primary action.

#### Scenario: Overview header
- **WHEN** the user opens the overview
- **THEN** the header shows "Overview", the month switcher, and the
  account picker when there is more than one active account

### Requirement: Month switcher
Wherever a page is about one month, it SHALL use the same month switcher.
The switcher shows the month by name with previous and next controls, and
SHALL NOT move past the current month in the browser's local time.

#### Scenario: Can't go past this month
- **WHEN** the switcher shows the current month
- **THEN** the next-month control is disabled

#### Scenario: The month follows local time
- **WHEN** it is 1 November 00:30 local time while UTC is still 31
  October
- **THEN** the switcher's current month is November

### Requirement: Amounts and dates are easy to scan
In tables and lists, amounts SHALL be right-aligned in tabular figures.
Money in SHALL show with a "+" in the positive colour; money out SHALL
show in the normal text colour. Figures in the overview's tiles and
needs-attention items SHALL be shown in whole euros. Dates SHALL be shown
as a short day and month, with the year only when it isn't the current
year.

#### Scenario: Money in and out in a table
- **WHEN** a table lists a salary of +2,400.00 and groceries of -45.20
- **THEN** the salary reads "+€2,400.00" in the positive colour, the
  groceries "-€45.20" in the normal colour, and both are right-aligned

#### Scenario: Tile figure
- **WHEN** a tile's figure is 3,482.17
- **THEN** it reads "€3,482"

#### Scenario: Short dates
- **WHEN** a transaction from 2026-10-23 is listed in 2026 with British
  English browser settings
- **THEN** its date reads "23 Oct", not "2026-10-23"

#### Scenario: Another year
- **WHEN** a transaction from 2025-12-30 is listed in 2026 with British
  English browser settings
- **THEN** its date reads "30 Dec 2025"

### Requirement: The app's font is bundled
The app SHALL serve its font itself, so a self-hosted install makes no
request to an external font service.

#### Scenario: No external font request
- **WHEN** the app loads in a browser
- **THEN** no request is made to a font host outside the app

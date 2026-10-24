# Ui-Shell Specification

## Purpose

The UI shell covers the cross-cutting interface behaviors every page
shares - theme, navigation, and feedback - so each page doesn't have to
reinvent them and the app reads as one consistent product.

## Requirements

### Requirement: Theme switching with persistence
The system SHALL let the user switch between a light and a dark theme,
and SHALL remember that choice across sessions. Until the user makes an
explicit choice, the system SHALL follow the operating system's light/dark
preference.

#### Scenario: Follows the OS preference by default
- **WHEN** the user has never explicitly chosen a theme
- **THEN** the app renders in light or dark mode according to the
  operating system's current preference

#### Scenario: Explicit choice overrides the OS preference
- **WHEN** the user switches the theme toggle to dark
- **THEN** the app immediately renders in dark mode, regardless of the
  operating system's preference

#### Scenario: Choice persists across sessions
- **WHEN** the user has explicitly chosen a theme and later closes and
  reopens the app
- **THEN** the app renders in that previously chosen theme, not the OS
  default

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

### Requirement: Consistent operation feedback
The system SHALL report the outcome of a user-initiated action (create,
edit, delete, archive, import, etc.) through a consistent, dismissible
notification, for both success and failure.

#### Scenario: Successful action shows a confirmation
- **WHEN** a user action completes successfully
- **THEN** a success notification appears and dismisses itself after a
  short delay, without blocking further interaction

#### Scenario: Failed action shows the reason
- **WHEN** a user action fails
- **THEN** an error notification appears stating the reason, and remains
  until the user dismisses it or takes another action

### Requirement: Stable, responsive in-place list updates
The system SHALL keep an already-loaded list's current content visible
while it refreshes in the background, rather than replacing it with a
loading state - a loading indicator SHALL appear only when a list has
no data yet. The system SHALL give immediate visual feedback for a
specific user-triggered action (e.g. disabling the control that
triggered it) for the duration of that action, rather than leaving the
interface static until the action completes.

#### Scenario: Background refresh keeps existing rows visible
- **WHEN** a list that already has data is refreshing after an add, edit,
  delete, or filter change
- **THEN** the previously-loaded rows remain visible the whole time, with
  no loading placeholder replacing them and no layout shift

#### Scenario: First load still shows a loading state
- **WHEN** a list has not loaded any data yet (e.g. the page was just
  opened)
- **THEN** the system shows a loading indicator, since there is nothing
  yet to keep visible

#### Scenario: A clicked action gives immediate feedback
- **WHEN** the user clicks a control that triggers an action (e.g.
  deleting a row)
- **THEN** that control is disabled immediately, before the action
  completes, so the click is visibly registered rather than appearing to
  do nothing

### Requirement: Amounts are shown in euro
Every monetary amount the app displays SHALL be formatted as euro,
including chart axes, tooltips and table views. Thousands and decimal
separators SHALL follow the browser's language settings.

#### Scenario: Ledger amounts use the euro sign
- **WHEN** a transaction of -42.50 is shown in the ledger
- **THEN** its amount reads as a euro amount (for example "-€42.50", or
  "€ -42,50" with Dutch browser settings), never with a dollar sign

#### Scenario: Chart axes use the euro sign
- **WHEN** the dashboard's in vs out chart labels its axis at 1,500.00
- **THEN** the label is a short euro amount such as "€1.5K"

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

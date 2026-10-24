# Spec Delta

## MODIFIED Requirements

### Requirement: Responsive navigation
The system SHALL show the primary navigation as a sidebar on wide
viewports and as a bottom tab bar on narrow viewports. The sidebar SHALL
list Overview, Transactions, Review, Budgets and Forecast, then Import
and Accounts, with the total balance of the active accounts, the theme
toggle and sign out in its footer. The tab bar SHALL show Overview,
Transactions, Review, Budgets and More, where More opens the rest, the
theme toggle and sign out. Review SHALL show its waiting count in both.

#### Scenario: Wide viewport shows navigation inline
- **WHEN** the viewport is at least 1024px wide
- **THEN** every navigation link is visible in the sidebar, and the
  sidebar footer shows "Total · 2 accounts" with the two accounts'
  combined balance

#### Scenario: Narrow viewport collapses navigation
- **WHEN** the viewport is narrower than 1024px
- **THEN** a bottom tab bar shows Overview, Transactions, Review, Budgets
  and More, and opening More reveals Forecast, Import, Accounts, the
  theme toggle and sign out

#### Scenario: The current page is marked
- **WHEN** the user is on Budgets
- **THEN** Budgets is marked as current in the sidebar or tab bar

### Requirement: Page header
Every page SHALL start with a header that shows its title, and, where
the page has them, its month switcher, its account picker and its
primary action.

#### Scenario: Overview header
- **WHEN** the user opens the overview
- **THEN** the header shows "Overview", the month switcher and Import,
  and no account picker

## ADDED Requirements

### Requirement: Accounts under Transactions in the sidebar
With more than one active account, the sidebar SHALL list them under
Transactions, indented, each with its balance in whole euros; long names
SHALL be shortened with the full name shown on hover. The open account
SHALL be the only one marked as current. With one active account there
SHALL be no sub-items. Beyond five accounts, the sidebar SHALL list the
first five and a "+N more" link to Accounts.

#### Scenario: Two accounts in the sidebar
- **WHEN** "Revolut" holds 2,140.00 and "Crelan" 1,342.00
- **THEN** the sidebar lists "Revolut €2,140" and "Crelan €1,342" under
  Transactions

#### Scenario: The open account is marked
- **WHEN** the user is on Crelan's transactions
- **THEN** "Crelan" is marked as current and "Transactions" is not
  filled

#### Scenario: One account
- **WHEN** there is only one active account
- **THEN** Transactions has no sub-items

#### Scenario: Many accounts
- **WHEN** there are seven active accounts
- **THEN** the sidebar lists five of them and "+2 more", linking to
  Accounts

### Requirement: Account pills on narrow screens
Below 1024px, with more than one active account, the Transactions page
SHALL show a row of account pills under its title, scrolling sideways
when they don't fit, with the open account highlighted and its balance
shown at the end of the row.

#### Scenario: Switch account on a phone
- **WHEN** the user is on Revolut's transactions at 390px wide and taps
  "Crelan"
- **THEN** Crelan's transactions open and the "Crelan" pill is
  highlighted

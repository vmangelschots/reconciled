# Spec Delta

## MODIFIED Requirements

### Requirement: Responsive navigation
The system SHALL show the primary navigation as a sidebar on wide
viewports and as a bottom tab bar on narrow viewports. The sidebar SHALL
list Overview, Transactions, Review, Budgets and Forecast, then Import,
Accounts and Settings, with the total balance of the active accounts, the
theme toggle and sign out in its footer. The tab bar SHALL show Overview,
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
  and More, and opening More reveals Forecast, Import, Accounts, Settings,
  the theme toggle and sign out

#### Scenario: The current page is marked
- **WHEN** the user is on Budgets
- **THEN** Budgets is marked as current in the sidebar or tab bar

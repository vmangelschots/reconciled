# Spec Delta

## ADDED Requirements

### Requirement: Budgets month in the address
The Budgets page SHALL use the shared month switcher, and SHALL keep the
chosen month in its address, so a link can open it on a given month.
Without a month in the address it SHALL open on the current month in
local time.

#### Scenario: A link opens the right month
- **WHEN** the user opens /budgets?month=2026-09
- **THEN** the budget summary shows September 2026

#### Scenario: Switching updates the address
- **WHEN** the user moves the month switcher from October to September
- **THEN** the address shows month=2026-09, and reloading keeps September

#### Scenario: Local time decides the current month
- **WHEN** it is 1 November 00:30 local time while UTC is still 31
  October, and the user opens /budgets
- **THEN** the page shows November

# Spec Delta

## MODIFIED Requirements

### Requirement: Budget headline
The Budgets page's month view SHALL open with a headline showing the viewed
month's budgeted spending against its limits with a progress bar, what's
left or how much over, and a line with the month's other spending. Its
figures SHALL equal the Overview's budget tile for that month. The month
view's headline SHALL NOT show a year total; year totals belong to the Year
view (see the `year-plans` capability).

#### Scenario: Same figures as the Overview
- **WHEN** on 24 October limits total 910.00, budgeted categories have spent
  785.00, yearly budgets 130.00, categories without a budget 35.00 and
  uncategorized 42.00
- **THEN** the headline shows "€785 of €910", "€125 left · €17 a day", and
  "€130 on yearly budgets · +€35 outside budgets · €42 uncategorized"

#### Scenario: No limits yet
- **WHEN** no category has a limit
- **THEN** the headline shows the month's spending without a bar, and says
  to click a category to set a budget

## ADDED Requirements

### Requirement: Month and Year views
The Budgets page SHALL have a Month | Year switch in its header. Month SHALL
be the page as it is, with the month switcher; Year SHALL show the year
plans with a year switcher instead. The page SHALL open on Month unless
the address names the Year view, and the switch SHALL keep the viewed
month's year.

#### Scenario: From October to the year
- **WHEN** the user views October 2026 and switches to Year
- **THEN** the Year view shows 2026, and switching back shows October 2026

#### Scenario: A link to the Year view
- **WHEN** the user opens a link to the Year view of 2027
- **THEN** the Budgets page opens on Year, showing 2027

### Requirement: Plan the rest of the year
For the current month, the month view SHALL offer "Plan the rest of the
year", which opens the Year view of the current year on a new draft
copied from Current, from next month. In December it SHALL NOT be offered.

#### Scenario: Correcting in June
- **WHEN** on 14 June 2027 the user chooses "Plan the rest of the year"
- **THEN** the Year view of 2027 opens on a new draft "Rest of 2027" from
  July

### Requirement: Plan next year nudge
From 1 November, the month view's headline for the current month SHALL
offer "Plan <next year>", which opens the Year view of next year. Once
next year has a draft, it SHALL offer "Continue planning <next year>"
with the most recently changed draft's name, opening that draft. It SHALL
NOT show once a draft of next year has been applied.

#### Scenario: Mid-November
- **WHEN** on 16 November 2026 the user opens the Budgets page and 2027 has
  no drafts
- **THEN** the headline offers "Plan 2027", which opens the Year view of 2027

#### Scenario: Already planning
- **WHEN** 2027 has draft "Lean"
- **THEN** the headline offers "Continue planning 2027 · Lean", which opens
  "Lean"

#### Scenario: Planned
- **WHEN** a draft of 2027 has been applied
- **THEN** the headline offers neither

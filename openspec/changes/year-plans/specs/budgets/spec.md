# Spec Delta

## ADDED Requirements

### Requirement: A default limit applies from a month on
A monthly category's default limit SHALL be able to change from a given
month on, keeping the earlier default for the months before it. A month
SHALL use its override, else the latest default from that month or
before, else the earliest default. A default set without a month SHALL
apply to every month until the next change.

#### Scenario: A new default from July
- **WHEN** "Groceries" has a default of 650.00 and gets 550.00 from July
  2027 on
- **THEN** June 2027 uses 650.00 and July 2027 and later use 550.00

#### Scenario: Before the first default
- **WHEN** "Groceries"'s only default starts in July 2027
- **THEN** March 2027 uses it too

#### Scenario: Overrides still win
- **WHEN** "Groceries" has 550.00 from July and 800.00 for December only
- **THEN** December uses 800.00

### Requirement: Editing the default edits the one in effect
Setting a category's default limit for a viewed month SHALL change the
default in effect in that month, from the month it started in, until the
next change. Other periods' defaults SHALL stay as they are.

#### Scenario: Editing in March
- **WHEN** "Groceries" has 650.00 until June and 550.00 from July, and the
  user sets the default to 600.00 while viewing March
- **THEN** January to June use 600.00 and July on still uses 550.00

#### Scenario: Editing in September
- **WHEN** the user then sets the default to 500.00 while viewing September
- **THEN** July on uses 500.00 and January to June still use 600.00

### Requirement: Removing a budget removes every default
Removing a category's budget, or switching it to a yearly kind or Bills,
SHALL delete all its defaults, from every period, along with its overrides.

#### Scenario: Remove after a plan was applied
- **WHEN** "Groceries" has defaults from January and from July and the user
  removes its budget
- **THEN** no month has a limit for "Groceries"

# Spec Delta

## ADDED Requirements

### Requirement: Household switcher
A user in several households SHALL see the active household's name and be able to
switch, in the sidebar footer on wide viewports and under More on narrow ones.
Switching SHALL reload the app in the chosen household, on the Overview. A user in
one household SHALL see no switcher.

#### Scenario: One household
- **WHEN** a user belongs to one household
- **THEN** the sidebar and More look as they did, with no household name or switcher

#### Scenario: Switching on a wide viewport
- **WHEN** a user in two households picks the other one in the sidebar footer
- **THEN** the app reloads on that household's Overview, and nothing from the
  previous household is shown

#### Scenario: Switching on a narrow viewport
- **WHEN** a user in two households opens More
- **THEN** it shows the active household and lets them pick the other

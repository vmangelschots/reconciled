# Spec Delta

## ADDED Requirements

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

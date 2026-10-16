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
The system SHALL show the primary navigation inline on wide viewports and
collapse it into a toggleable menu on narrow viewports, rather than
letting it overflow.

#### Scenario: Wide viewport shows navigation inline
- **WHEN** the viewport is at least tablet width
- **THEN** every navigation link is visible directly in the header

#### Scenario: Narrow viewport collapses navigation
- **WHEN** the viewport is narrower than tablet width
- **THEN** navigation links are hidden behind a menu toggle, and opening
  it reveals every link

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

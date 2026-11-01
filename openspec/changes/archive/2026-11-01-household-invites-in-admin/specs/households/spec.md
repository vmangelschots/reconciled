# Spec Delta

## ADDED Requirements

### Requirement: Invite links from Django admin
Adding a household in Django admin SHALL create an invite for it and show the
operator its link once. The operator SHALL also be able to create a new invite
link for one existing household there. The link SHALL be plain text to copy, not
a link to follow, and these invites SHALL follow the same rules as any other.

#### Scenario: Adding a household
- **WHEN** the operator adds a household in Django admin
- **THEN** the confirmation shows an invite link for it, using the address the
  operator is on

#### Scenario: A new link for an existing household
- **WHEN** the operator selects one household and chooses to create an invite link
- **THEN** a new link is shown once, and the household's pending invites list it
  in Settings

#### Scenario: Several households selected
- **WHEN** the operator selects more than one household and chooses to create an
  invite link
- **THEN** no invite is created and a message says to select one household

#### Scenario: A staff login without change rights
- **WHEN** a staff login that can't change households opens the household list
- **THEN** the action to create an invite link isn't offered

#### Scenario: Link can't be seen again
- **WHEN** the operator returns to the household in Django admin
- **THEN** the link isn't shown again and neither is any other invite link

### Requirement: The sign-in page explains how to get a login
The sign-in page SHALL say that a login comes from an invite link, and who to ask
for one. It SHALL NOT offer any way to create a login.

#### Scenario: Someone without a login
- **WHEN** someone opens the sign-in page
- **THEN** they read "New here? Ask someone in your household, or whoever runs
  Reconciled, for an invite link."
- **AND** the page has no form or link for creating a login

## MODIFIED Requirements

### Requirement: The operator manages households and logins
A login SHALL only be created through an invite or by the operator. The operator
SHALL create households outside the app's pages, in Django admin or with a
command, getting an invite link for the first member, and SHALL be able to remove
members and delete a household with all of its data. Django admin SHALL NOT show
budget data or credentials.

#### Scenario: A new household
- **WHEN** the operator creates a household
- **THEN** they get an invite link, and whoever accepts it is in an empty household

#### Scenario: No open sign-up
- **WHEN** someone without an invite tries to create a login
- **THEN** there is no way to do so

#### Scenario: Deleting a household
- **WHEN** the operator deletes a household
- **THEN** all its data and memberships are gone and other households are unchanged

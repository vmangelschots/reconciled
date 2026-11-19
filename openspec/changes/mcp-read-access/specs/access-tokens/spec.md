# Spec Delta

## Purpose

Lets a user give an AI assistant or other MCP client read access to one of
their households, with a personal access token they can see, name and revoke.

## ADDED Requirements

### Requirement: Create a token
A signed-in user SHALL be able to create a personal access token in a "MCP
access" section of Settings. They give it a name. The token belongs to that
user and to their active household. Before creating it, the section SHALL say
that an assistant with the token can read all of the household's data and
passes what it reads on to its model provider.

#### Scenario: Creating a token
- **WHEN** a user in "The Peeters household" creates a token named "Laptop
  Claude Code"
- **THEN** the token is created for that user and that household, and it
  appears in the section's list

#### Scenario: A name is required
- **WHEN** a user tries to create a token with an empty name
- **THEN** the token isn't created and the name field says a name is needed

### Requirement: A token is shown once
The token's secret SHALL be shown in full once, right after it's created,
with a button to copy it. It starts with `rcn_`. It SHALL NOT be shown again
and SHALL NOT be stored in readable form. The list shows only its first
characters.

#### Scenario: After creating
- **WHEN** a user creates a token
- **THEN** the full token is shown with a copy button and a note that it
  won't be shown again

#### Scenario: Coming back later
- **WHEN** the user reloads Settings
- **THEN** the token's row shows its name and its first characters (for
  example "rcn_a1b2…"), never the full token

### Requirement: List my tokens
The section SHALL list the user's own tokens for the active household: name,
first characters, when it was created and when it was last used ("Never
used" before its first use). Tokens of other members SHALL NOT be listed, and
neither SHALL tokens for the user's other households.

#### Scenario: Two members
- **WHEN** two members of a household each created a token
- **THEN** each of them sees only their own token in the list

#### Scenario: Two households
- **WHEN** a user has a token for each of their two households
- **THEN** the list shows the token of whichever household is active

#### Scenario: Last used
- **WHEN** a token was used by an MCP client five minutes ago
- **THEN** its row says it was last used about five minutes ago

### Requirement: Revoke a token
A user SHALL be able to revoke one of their tokens after confirming. A
revoked token SHALL stop working at once and disappear from the list.

#### Scenario: Revoking
- **WHEN** a user revokes "Laptop Claude Code" and confirms
- **THEN** the token is gone from the list and the next request made with it
  is refused

### Requirement: A token works only while its user is in its household
A token SHALL be accepted only while its user can sign in and is a member of
the token's household. The checks SHALL apply on every request, so access
ends as soon as membership does. If the user later becomes a member again,
the token SHALL work again unless it was revoked.

#### Scenario: Leaving the household
- **WHEN** a user with a token for "The Peeters household" leaves that
  household
- **THEN** the next request made with that token is refused

#### Scenario: Deactivated login
- **WHEN** a user's login is deactivated
- **THEN** requests made with any of their tokens are refused

### Requirement: A token reads only its own household
A token SHALL give access to its own household only, whichever household its
user has active in the browser.

#### Scenario: Switching household in the browser
- **WHEN** a user with a token for "The Peeters household" switches to
  another household in the app
- **THEN** an MCP client using the token still reads "The Peeters household"

### Requirement: A token can't use the app's regular API
A token SHALL only be accepted by the MCP endpoint. A request to any other
part of the app that carries a token instead of a signed-in session SHALL be
refused as not signed in.

#### Scenario: Calling the API with a token
- **WHEN** a request to the transactions API carries a valid token as a
  bearer token and no session
- **THEN** it is refused as not signed in, and nothing is read or changed

### Requirement: Connecting a client
The section SHALL show the MCP endpoint's URL for this instance and a
configuration snippet for an MCP client, each with a copy button. Right after
a token is created, the snippet SHALL include that token.

#### Scenario: Copying the snippet after creating
- **WHEN** a user has just created a token
- **THEN** the snippet shows the endpoint URL and the token as a bearer
  header, ready to paste into a client's configuration

#### Scenario: No token shown
- **WHEN** the user comes back to the section later
- **THEN** the snippet shows a placeholder where the token goes

### Requirement: Tokens aren't in backups
A household backup SHALL NOT contain access tokens. Restoring a backup SHALL
leave the existing tokens as they are.

#### Scenario: Downloading a backup
- **WHEN** a member downloads a backup of a household that has tokens
- **THEN** the backup contains no tokens or token hashes

#### Scenario: Restoring a backup
- **WHEN** a member restores a backup into a household that has tokens
- **THEN** those tokens keep working afterwards

# Spec Delta

## Purpose

Lets a few invited households share one Reconciled instance, each seeing and
changing only its own budget, with members joining by invite and a user able to
belong to several households.

## ADDED Requirements

### Requirement: Users belong to households
Every signed-in user SHALL belong to at least one household, and MAY belong to
several. A household SHALL be able to have several users. All members of a
household SHALL have the same rights and see the same data, with no roles between
them.

#### Scenario: Two members share a ledger
- **WHEN** two users belong to the same household and one adds a transaction
- **THEN** the other sees it the next time their list loads

#### Scenario: A user in two households
- **WHEN** a user belongs to two households
- **THEN** they see one household's data at a time, never the two combined

### Requirement: One active household
A signed-in user SHALL work in one active household at a time. Signing in SHALL
open the household they last used. Every read and write SHALL apply to the active
household, and only a household the user belongs to can be active.

#### Scenario: Signing in again
- **WHEN** a user in two households last used "The Peeters household" and signs in
- **THEN** that household is active

#### Scenario: Activating a household they don't belong to
- **WHEN** a user asks to switch to a household they aren't a member of
- **THEN** the request is refused like one for a household that doesn't exist

### Requirement: A stale tab can't change the wrong household
A request made by a page that loaded a different household from the active one
SHALL be refused without changing anything, and that page SHALL reload.

#### Scenario: Switched in another tab
- **WHEN** a user switches household in one tab and saves a transaction in another
  tab still showing the old household
- **THEN** the save is refused, nothing changes in either household, and the tab
  reloads with a message that the household changed

### Requirement: Invite someone to a household
Any member SHALL be able to create an invite link in the Household section, and
copy it to send themselves. A link SHALL work once, expire after 7 days and belong
to one household. The app SHALL NOT send email or store the link in readable form.

#### Scenario: Creating an invite
- **WHEN** a member presses Invite someone
- **THEN** they get a link to copy, shown once, and the Household section lists a
  pending invite with who created it and when it expires

#### Scenario: Revoking an invite
- **WHEN** a member revokes a pending invite
- **THEN** its link stops working

### Requirement: Accept an invite
The invite page SHALL name the household and warn that members see all its data.
A person SHALL be able to create a login there, or sign in with an existing one,
and join. Joining SHALL make that household active. Only a valid link SHALL reveal
the household's name.

#### Scenario: A new person accepts
- **WHEN** someone opens a valid invite, and chooses a username and password
- **THEN** their login is created, they join the household, and they are signed in

#### Scenario: An existing user accepts
- **WHEN** a signed-in user opens a valid invite and confirms
- **THEN** they join that household too, keeping their other households

#### Scenario: Already a member
- **WHEN** a member of the household opens an invite to it
- **THEN** a message says they're already a member, and the link can still be used

#### Scenario: A used, expired or revoked link
- **WHEN** someone opens a link that was used, has expired, was revoked or never
  existed
- **THEN** the page says "This invite link no longer works. Ask for a new one.",
  with nothing about any household

#### Scenario: A username that's taken
- **WHEN** someone chooses a username already in use
- **THEN** an error says so, and the invite stays unused

### Requirement: Leave a household
A member SHALL be able to leave a household after confirming, if they belong to
another household and someone else remains in this one. Leaving SHALL keep the
household's data, and SHALL switch them to another household.

#### Scenario: Leaving
- **WHEN** a user in two households leaves one that has another member
- **THEN** they lose access to it, its data stays, and their other household opens

#### Scenario: Their only household
- **WHEN** a user belongs to one household
- **THEN** Leave household isn't offered

#### Scenario: The last member
- **WHEN** a user is the only member of a household
- **THEN** Leave household isn't offered

### Requirement: A login without a household can't be used
A user without a household SHALL NOT reach any budget data. Signing in SHALL show
why, and a session whose user has lost their last household SHALL end. A user who
loses their active household but has another SHALL move to that one.

#### Scenario: Login without a household
- **WHEN** a user with the correct password has no household
- **THEN** sign-in fails with "This login isn't part of a household yet. Ask the
  person who runs Reconciled to add you."

#### Scenario: Removed during a session
- **WHEN** a signed-in user's only household membership is removed
- **THEN** their next request is refused, and they return to the sign-in page

#### Scenario: Removed from one of two households
- **WHEN** a signed-in user is removed from their active household and has another
- **THEN** their next request is refused, and the app reloads in the other household

### Requirement: Households can't reach each other's data
Every read and write SHALL be limited to the active household. An id
from another household SHALL be treated exactly like an id that doesn't exist,
whether it is in a URL or in submitted data.

#### Scenario: Reading another household's transaction
- **WHEN** a user requests a transaction that belongs to another household
- **THEN** the response is the same as for an id that doesn't exist

#### Scenario: Using another household's category
- **WHEN** a user saves a transaction with a category id from another household
- **THEN** the save is refused and neither household's data changes

#### Scenario: Totals stay separate
- **WHEN** two households each have transactions in the same month
- **THEN** every report, budget and overview figure counts only the active
  household

### Requirement: Names are unique within a household
Top-level category names SHALL be unique within a household, and budget settings
SHALL be kept per household. Two households SHALL be able to use the same names.

#### Scenario: The same category in two households
- **WHEN** two households each create a top-level category "Groceries"
- **THEN** both are saved

### Requirement: The operator manages households and logins
A login SHALL only be created through an invite or by the operator. The operator
SHALL create households outside the app's pages, getting an invite link for the
first member, and SHALL be able to remove members and delete a household with all
of its data. Django admin SHALL NOT show budget data or credentials.

#### Scenario: A new household
- **WHEN** the operator creates a household
- **THEN** they get an invite link, and whoever accepts it is in an empty household

#### Scenario: No open sign-up
- **WHEN** someone without an invite tries to create a login
- **THEN** there is no way to do so

#### Scenario: Deleting a household
- **WHEN** the operator deletes a household
- **THEN** all its data and memberships are gone and other households are unchanged

### Requirement: Household section in Settings
Settings SHALL show a Household section first, with the household's name, its
members with the signed-in user marked, pending invites, and Leave household when
allowed. The name SHALL NOT be editable here, and members SHALL NOT be able to
remove each other.

#### Scenario: Viewing the household
- **WHEN** a member opens Settings
- **THEN** the Household section shows the name and all members, with "You" next
  to their own login, and nothing from any other household, even one the user
  also belongs to

### Requirement: Change your own password
A signed-in user SHALL be able to change their own password in the Household
section by giving the current one, and SHALL stay signed in.

#### Scenario: Change password
- **WHEN** a user enters their current password and a new one
- **THEN** the password changes, they stay signed in, and a notification says
  "Password changed."

#### Scenario: Wrong current password
- **WHEN** a user enters the wrong current password
- **THEN** the password doesn't change and an error says so

### Requirement: Existing data moves into a first household
On upgrade, an instance with existing data or users SHALL put all of them into
one first household. Its members SHALL see the same data as before, and AI
categorization SHALL stay as it was.

#### Scenario: Upgrading an instance
- **WHEN** an instance with one user and existing transactions is upgraded
- **THEN** that user signs in as before and every account, transaction, budget
  and report is unchanged

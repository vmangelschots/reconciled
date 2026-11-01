# Spec Delta

## MODIFIED Requirements

### Requirement: Backend prepares the database before serving
Before serving traffic, the backend SHALL apply pending migrations, create the
configured app user if it doesn't exist yet, and make sure that user belongs to a
household. If Enable Banking values are still in the environment and the first
household has no credentials, it SHALL store them there once. It SHALL NOT
receive traffic until these have succeeded and it reports healthy.

#### Scenario: First start creates the user
- **WHEN** the backend starts against an empty database
- **THEN** migrations are applied, the user from the Secret is created in a first
  household, and only then does the pod become ready

#### Scenario: Restart keeps an existing user's password
- **WHEN** the backend restarts and the user already exists
- **THEN** the user is left unchanged, and the pod becomes ready

#### Scenario: Existing bank credentials carry over
- **WHEN** the backend starts with Enable Banking values in the environment, a
  working encryption key, and a first household without credentials
- **THEN** the values are stored for that household, and bank sync keeps working

#### Scenario: No encryption key
- **WHEN** the backend starts with Enable Banking values but no encryption key
- **THEN** it logs a clear error and the app serves, with bank sync shown as not
  set up

### Requirement: No secrets in the repository or images
Database credentials, the Django secret key, the app user's credentials and the
encryption keys for stored credentials SHALL come from a Kubernetes Secret at
runtime. The repository SHALL ship only an example Secret with placeholder values,
and no image SHALL contain real secrets.

#### Scenario: Example secret is clearly a placeholder
- **WHEN** a user looks at the shipped example Secret
- **THEN** every value is an obvious placeholder (e.g. `change-me`), and
  the README tells them to replace it before applying

## ADDED Requirements

### Requirement: Encryption keys can be rotated
The app SHALL accept several encryption keys, using the newest to write and all of
them to read, and the operator SHALL be able to re-encrypt stored credentials with
the newest key. The README SHALL say that database dumps don't hold the keys.

#### Scenario: Rotating the key
- **WHEN** the operator adds a new key and runs the rotation
- **THEN** every household's credentials still work, and the old key can be
  removed

# Proposal

Issue: #41

## Why

Reconciled assumes one household per instance. A few invited households should
be able to share one instance, with their budgets fully separated and bank sync
running on each household's own Enable Banking app, because restricted mode
only reaches accounts linked to the app that fetches them.

## What Changes

- **BREAKING** All data belongs to a household. Every API request is limited to
  the signed-in user's household, and a user without one can't sign in.
- A user belongs to one or more households, and a household can have several
  users with equal rights. Anyone in several households switches between them.
- Members invite people with a single-use link, and the operator creates
  households. There is no open sign-up: a login needs an invite or the operator.
- **BREAKING** Enable Banking credentials move from the server's environment to
  encrypted per-household storage, entered through a guided setup in Settings.
  The private key can't be read back. The scheduled sync runs each household
  with its own credentials, and one household's failure or running sync doesn't
  affect another's.
- A joint bank account can be linked in two households, each with its own seen
  lines.
- **BREAKING** Backup and restore cover one household. Restore gives rows new
  ids, so a file can be restored next to other households, and it never touches
  them. The backup format version goes up; older backups still restore.
- AI categorization becomes a per-household choice, off for new households, with
  consent that says what is sent and to whom. The existing household keeps it on.
- Settings gains a Household section with the household name, its members,
  invites, Leave household and Change password. A new household gets a first-run
  Overview.
- Budget settings and top-level category names become per household.
- **BREAKING** Django admin no longer shows budget data, so that invited
  households' figures stay out of it. It keeps households, users and memberships.
- A migration moves all existing data and users into a first household.

## Capabilities

### New Capabilities

- `households`: Households, membership, invites, the active household, the
  separation of their data, how the operator creates them, and the Household
  section in Settings.

### Modified Capabilities

- `bank-sync`: Credentials per household with a guided setup; sync, locks and
  bank data per household.
- `data-backup`: Backups and restores limited to one household, new ids on
  restore, and restoring another household's backup.
- `auto-categorization`: AI is a per-household choice with consent.
- `overview`: A first-run state and a reminder when bank sync has stopped.
- `ui-shell`: A household switcher for users in several households.
- `deployment`: Startup ensures a household, and a new encryption secret replaces
  the Enable Banking values in the Secret.

## Impact

- **Backend:** every data app, a new `households` app, new migrations, default
  managers, `backup/format.py`, `banksync/client.py`, `banksync/sync.py`,
  `transactions/ai.py`, `core/views.py`, `bootstrap_user`, admin registrations
  and a new `households` test suite for isolation.
- **Frontend:** `SettingsPage`, `BankConnections`, `OverviewPage`, `ReviewPage`,
  `LoginPage`, `Layout`, `AccountsContext`, the API client, `lib/backup.js`,
  `api/bankSync.js`, a public invite page, and new Settings components.
- **Deployment:** new `HOUSEHOLD_ENCRYPTION_KEYS` secret, `k8s/` example Secret
  and README. The `cryptography` package is already pinned.
- **Project context:** `openspec/config.yaml` drops its single-household
  assumption.
- **External:** whether several restricted-mode apps may run on one operator's
  server isn't confirmed with Enable Banking. That doesn't block this change, but
  it does block connecting another household's bank.

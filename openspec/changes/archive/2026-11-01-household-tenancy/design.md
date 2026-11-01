# Design

## Context

See proposal.md for motivation. Nothing in the app knows about owners today: no
model has one, about 122 non-test `.objects.` calls are global, `BudgetSettings`
is a `pk=1` singleton, and backup restore truncates whole tables. The expected
scale is a handful of trusted households on one Postgres. Input came from
architecture, UX and UI reviews of the code.

## Goals / Non-Goals

**Goals:**
- A missed filter fails loudly instead of leaking data.
- Isolation is proved by tests that cover new routes and models automatically.
- The existing household notices nothing on upgrade.

**Non-Goals:**
- Open sign-up, roles, sending email, or members removing each other.
- A combined view across households.
- Separate instance, schema or database per household.
- Hiding data from the operator, who can always read the database.
- Live updates between members, or "changed by" labels.
- Household-level OpenAI keys or quotas.

## Decisions

### Data model

New `households` app with `Household`, `Membership(user FK, household FK PROTECT,
last_used_at)`, unique on the pair, and `Invite`. `auth.User` stays; swapping `AUTH_USER_MODEL` mid-project isn't worth it.

Models that have other owners inherit through them, declared once as
`household_path`, so a row can't disagree with its parent:

| Direct FK | Inherited |
|---|---|
| `Account`, `Category` | `Loan`, `RecurringTransaction`, `ImportSession`, `AccountImportSettings` via `account` |
| `Transaction` (index `household, date`) | `LoanCorrection` via `loan__account` |
| `BudgetSettings` (OneToOne, replaces `pk=1`) | `CategoryLimit`, `YearlyBudget` via `category` |
| `BankConnection`, `BankAccountLink`, `SeenBankLine` | `imported_accounts` through table via session |

Constraints: `unique_top_level_category_name` becomes `(household, name)`;
`one_seen_line_per_reference` becomes `(household, account_hash, reference)`; a new
unique `(household, account_hash)` on links replaces the check in code at
`banksync/views.py:227`. The rest are already scoped by their parent.

Django has no composite foreign keys, so a `check_household_integrity` command
verifies that a transaction's account and category share its household.

### Active household

Membership is many-to-many from the start, because a user who accepts a second
invite would otherwise have nowhere to go. The active household id lives in the
session, falling back to the membership with the latest `last_used_at`. It is
checked against membership on every request, so a removed user can't keep it.
Switching updates the session and `last_used_at`, then does a full page reload, so
no React state or selected account from the old household can survive. A household
in the URL was rejected: every route and link would change for a case most users
never hit.

Two tabs share a session, so the API client sends the household it loaded in an
`X-Household` header. `HasHousehold` answers 409 on a mismatch, and the client
reloads. A missing header is accepted, which keeps `force_authenticate` tests and
scripts simple. `AuthorizeView` stores the household in its session entry, and
`CompleteView` refuses a mismatch.

### Invites

`Invite` holds household, created_by, the SHA-256 of a 32-byte
`secrets.token_urlsafe` token, expires_at, used_at and used_by, and is excluded from
backups. Hashing means a database dump holds no working links. Hashing with a fast
digest is fine for a high-entropy random token. The token is shown once and lookup
is by hash. Accepting takes `select_for_update` on the invite and runs in one
transaction, so two people can't both use a link.

Only the invite endpoints skip `HasHousehold`, with `AllowAny` and an explicit
exemption in the isolation suite. An unknown, used, expired and revoked token all
answer the same. New passwords go through `AUTH_PASSWORD_VALIDATORS`. Email was
rejected because the app has no mail setup and a copied link suits a few people.

### Enforcement: fail-closed default manager and a contextvar

A `HouseholdScoped` abstract base gives `objects` a manager that filters on
`household_path` and raises if no household is bound. `all_households()` is the only
escape, and a test allowlists its callers. `save()` and `bulk_create` stamp the
household. `TransactionQuerySet` subclasses the scoped queryset. `_base_manager`
stays plain so `refresh_from_db`, cascades and `txn.account` keep working.

The household is bound by a DRF `HasHousehold` default permission class, not
middleware, because 18 test files use `force_authenticate`, which middleware can't
see. Small middleware only resets the contextvar in `finally`, so gunicorn thread
reuse can't carry it into another request.

**Alternatives:** Explicit filters in each view are what this design exists to avoid.
Postgres row-level security was rejected for now: `POSTGRES_USER` is a superuser
that bypasses it, so it needs a second role, per-transaction `SET LOCAL`, and join
policies for inherited tables. The default-manager approach doesn't exclude adding
it later.

### Foreign keys in submitted data

DRF's related fields read `_default_manager` at request time, so foreign ids are
refused like unknown ones. Class-level `Model.objects.all()` would now run at import
and crash, which is useful because it finds each frozen queryset. Those sites move
to the manager or `get_queryset()`: `transactions/serializers.py:207-209`,
`accounts/views.py:27-29,48`, `budgets/views.py:19`, `imports/views.py:59`.

### Jobs, commands and admin

`sync_all` loops households inside `household_context(h)`, including
`auto_link_transfers`, and catches failures per household. `SYNC_LOCK` becomes the
two-int `pg_try_advisory_lock(SYNC_LOCK, h.id)`. Households sync one after another,
which also limits how much one can use up the shared OpenAI quota. Other commands
take `--household` or loop.

Finance `ModelAdmin`s are unregistered, keeping only Household, User and Membership.
Admin then needs no context and shows no figures or credentials. The cost is losing
raw data browsing, which moves to the shell. Household deletion goes through a
`delete_household` command, because deleting through admin would hit the `.objects`
calls in the post_delete signal at `transactions/adjustments.py:97`.

### Credentials

`banksync.BankCredentials` (OneToOne household) holds the app ID and encrypted key,
and joins `EXCLUDED_MODELS`. Encryption is `MultiFernet` from the already pinned
`cryptography`, keyed by `HOUSEHOLD_ENCRYPTION_KEYS` (comma-separated, newest first).
It is separate from `DJANGO_SECRET_KEY`, so rotating one doesn't touch the other.
`rotate_encryption_key` re-encrypts every row.

`client.py` keeps its function API; `enabled()` and `_token()` read the current
household's credentials, so tests patching `client._call` keep working. Keys are
never cached at module level. A typed credentials error replaces today's generic
`BankError` for key failures, so sync can raise the household warning without
marking connections ended.

The state in `GET bank-sync` is derived from parsing the key and `GET /application`,
which reports `redirect_urls`, `active` and `environment`. The API returns
`redirect_url`, built by the same code that calls `/auth`, so the UI never guesses
it from `window.location`. Environment credentials are imported by `bootstrap_user`,
not a migration: it is idempotent and runs after `migrate` with the key present.

### Backup: always remap ids

`FORMAT_VERSION` becomes 2, and 1 stays accepted. Keeping primary keys can't work in
a shared table, so restore works on raw dicts before deserializing:

1. Take the household's sync lock, and refuse if it's busy.
2. Allocate new ids with `nextval(pg_get_serial_sequence(...))`, building an id map.
3. Rewrite pk and every FK, OneToOne and M2M value by walking `_meta`, including
   self-references. A target missing from the file is `BackupError(NOT_SAVED)`, so
   a crafted file can't reach another household's rows.
4. Remap ids inside JSON: `product_accounts` on `ImportSession` and
   `AccountImportSettings`. An unknown id becomes null.
5. Overwrite `household` from the request, never the file, and force `connection=None`.
6. Replace `TRUNCATE` (`format.py:188`) with scoped raw deletes in FK order, with FKs
   deferred as today. `Model.delete()` isn't usable: signals, and PROTECT on
   `Loan.paid_from`.
7. Deserialize and raw-save, then drop `sequence_reset_sql` (`format.py:195`).

The file is checked before anything is deleted, and all of it runs in one transaction.

### AI choice

The switch lives on `Household` with who and when. `get_guesser()` at `ai.py:71`
checks it, so the status endpoints report per household. It stays out of backups, so
restoring an old file can't turn sending on. The first household is migrated as on.

### UI

Paths are under `frontend/src/`. These choices settle where the UX and UI reviews
differed:

- **Settings order:** Household, Bank connections, AI categorization, Backup, one
  column, `Panel` throughout. `BankConnections` and Backup move from `Card` to
  `Panel` so the page has one header rhythm, with `Panel loading` instead of
  returning `null`.
- **Enable Banking setup sits inside Bank connections,** as `BankCredentials.jsx`,
  not a separate card, because it replaces the "isn't set up" text and has no meaning
  apart from it. It uses the UX review's four steps with the UI review's quiet step
  markers. Only the current step expands.
- **Secret field:** file picker first, with a `Textarea` behind "Paste the key
  instead". After saving, a static row shows the saved state, not a fake masked value,
  which would look editable and retrievable.
- **First run:** extends the `Panel` and `EmptyState` branch at `OverviewPage.jsx:434`
  with one primary action and two `ListRow` links, not a new screen or a checklist
  with ticks. `/settings` links need scroll-to-hash.
- **Household name is read-only.** Renaming was left out because the operator does it
  in admin and it's one less control.
- **Invites** are `ListRow`s under the members, with a Revoke action. The link is shown
  once, using the same copy control and fallback as the redirect URL.
- **New shared components, only these:** `SettingRow` (promoted from `BackupRow`),
  `StatusBadge`, `Textarea`. AI uses the existing `PillSwitch`.
- **The shell gains a switcher only for people in several households.** It sits in
  the sidebar footer, and under More on a phone. Everyone
  else sees the shell exactly as today.
- **Clipboard:** `navigator.clipboard` doesn't exist on plain-HTTP installs, hence the
  select-and-Ctrl+C fallback.

## Risks / Trade-offs

- [A query slips past the manager through `all_households()` or raw SQL] → Static
  allowlist test, plus the route-walking isolation suite.
- [A background path runs unbound] → It raises instead of reading everything.
- [Tests bind a household and mask missing context] → The isolation suite doesn't use
  that base class.
- [The encryption key is lost] → Households re-enter credentials; budgets aren't
  affected. The README says database dumps don't contain the key.
- [Enable Banking refuses this setup] → Household separation still stands; other
  households use CSV and OFX import.
- [One household exhausts the shared OpenAI key] → Accepted at this scale; AI failures
  never block categorizing.
- [The operator can read all data] → Accepted, and told to invited households.
- [An invite link is forwarded or leaked] → Single use, 7-day expiry and revoking
  limit it, and pending invites are visible to all members. Any member can invite
  anyone, which fits equal rights among trusted people.
- [A user forgets which household they're in] → The name shows in the switcher, and
  restore's confirmation names the household.
- [`GET /application` doesn't behave as assumed] → Its fields come from one example
  response, so checking it against a real app is a task. A failed check only affects
  the message shown.

## Migration Plan

The backend uses `Recreate`, so old and new code never overlap.

1. Take `pg_dump` and a v1 backup. Suspend the `bank-sync` CronJob. Add
   `HOUSEHOLD_ENCRYPTION_KEYS` to the Secret.
2. Each app gets three migrations, because mixing UPDATE and ALTER in one PostgreSQL
   transaction fails with "pending trigger events":
   - `households.0001` plus a data migration: if users or data exist, create the
     first household with all users as members and AI on, then add nullable fields.
   - `backfill`: one UPDATE per table, raising if a row has no household.
   - `enforce`: NOT NULL, add the new constraint, then remove the old one.
3. `bootstrap_user` gives the user a household and imports the environment credentials.
4. Run `check_household_integrity`, verify bank sync, and resume the CronJob.
5. Remove the `ENABLE_BANKING_*` environment values in the following release.

**Rollback:** reverse migrations are safe only while one household exists. After that,
category and seen-line uniqueness can't be reversed, so restore the dump.

## Open Questions

- Does Enable Banking allow several restricted-mode apps on one operator's server?
  This doesn't change the build; it decides whether another household connects a bank.
- Does `active` reflect linked accounts, and do bank account uids survive replacing
  the application? Only the wording of a message depends on these.

# Design

## Context

Greenfield project: no existing backend, frontend, data model, or
deployment. This design stands up all of it for the first time, so it
covers the whole stack rather than a single component. See
`proposal.md` - Why for motivation.

## Goals / Non-Goals

**Goals:**
- Stand up a minimal but coherent architecture (backend, frontend,
  storage, deployment) that the five v1 capabilities can be built on.
- Make money arithmetic exact and the ledger the single source of truth
  for balances, budgets, and forecasts - no duplicated or cached figures
  that can drift.
- Keep the import pipeline safe: nothing is written to the ledger until
  the user explicitly confirms a preview.

**Non-Goals:**
- Multi-currency support. v1 assumes one currency for the whole
  deployment, in minor units (cents). Multi-currency is a larger data
  model change (conversion rates, per-account currency) deferred to a
  later change.
- Multi-user/household accounts or granular permissions. v1 is
  single-user, protected by one login.
- Split transactions (one transaction allocated across multiple
  categories). Deferred; v1 is one category per transaction, as specced.
- Live bank sync (Plaid/SimpleFIN). Out of scope per project context.

## Decisions

### Backend: Django + Django REST Framework
Chosen for existing familiarity with Django, and it fits this app well
independent of that: this is a CRUD- and reporting-heavy app with no
concurrency pressure, which plays to Django's strengths. Django's ORM and
built-in migrations give versioned schema changes without assembling a
separate ORM and migration tool; its auth app provides the single-user
login (a `User` plus session authentication) instead of a hand-rolled
equivalent; and its admin site gives a free, immediately-usable back
office for inspecting and correcting data (e.g. a stuck import session or
a miscategorized transaction) without writing one-off scripts. Django
REST Framework (DRF) provides the JSON API the React frontend consumes:
serializers, viewsets/routers, and session-based authentication.

Trade-off: Django does not generate OpenAPI docs for free the way FastAPI
does - add `drf-spectacular` if interactive API docs are wanted. Django
is also sync-first by default; this is a non-issue here since nothing in
this app is concurrency-bound enough to need Django's async views/ORM
support.

### Database: PostgreSQL
Considered SQLite for zero-ops simplicity, but chose PostgreSQL:
self-hosted deployments (the Firefly III-style target) commonly run
docker-compose with a dedicated DB container already, Postgres handles
concurrent writes better if a future change adds background jobs (e.g.
scheduled forecast refresh), and numeric/date handling for financial data
is more robust. Ships as a `db` service in docker-compose; the backend
talks to it over the compose network.

### Money as integer minor units
All amounts are stored and computed as integers (cents), never floats, to
avoid rounding error accumulation across balance sums. The API and
frontend convert to/from a decimal display format at the edges only.

### Account balance is computed, not cached
Per the `accounts` spec, balance = starting balance + sum of
transactions. v1 computes this on read (indexed query on
`transactions(account_id, date)`) rather than maintaining a cached
running-balance column, to guarantee it can never drift from the ledger.
If this becomes a performance problem at scale, a later change can add a
derived/cached balance with explicit invalidation - not needed for v1
data volumes.

### Import as a two-phase, session-backed pipeline
Upload + parse + dedupe-check produce an `import_session` row (status
`pending`) holding the parsed candidate rows and their duplicate flags,
without creating any `transactions` rows yet. Confirming the import
converts the selected candidates into real transactions in one
transaction-scoped DB write and marks the session `committed`. This
matches the `transaction-import` spec's requirement that nothing is
written until the user confirms, and gives a natural point to expire or
discard an abandoned upload.

### Duplicate detection heuristic
A candidate is flagged as a likely duplicate when an existing transaction
on the target account matches on exact date and exact amount, and its
description has a similarity ratio above a fixed threshold (fuzzy string
match, e.g. `difflib.SequenceMatcher` ratio ≥ 0.8) against the
candidate's description. Chosen over exact-string match because bank
export formatting (extra whitespace, trailing reference numbers) varies
between the original entry and a re-exported row for the same real-world
transaction.

### CSV and OFX parsing
CSV: parsed with the stdlib `csv` module against the user's column
mapping - no assumptions about column names or order. OFX: parsed with
the `ofxparse` library, which handles the format variations across banks
better than a hand-rolled parser would.

### Forecast generated on demand, not materialized
A forecast is computed at request time by expanding each active recurring
transaction's schedule within the requested horizon and merging the
occurrences in date order with the account's current balance. Nothing is
pre-computed or stored, so editing or deleting a recurring definition
takes effect on the very next forecast request with no invalidation logic
needed.

### Budget periods use calendar dates, no time-of-day
Transaction `date` and budget period boundaries are plain calendar dates
(no timestamp, no per-user timezone). This avoids month-boundary
ambiguity for a single-user, single-deployment app; a timestamp-level
timezone model is unnecessary complexity for v1.

### Single-user auth
Django's built-in auth app provides the user model and password hashing;
a single `User` is created for the deployment (e.g. via `createsuperuser`
or a bootstrap command). DRF's session authentication (Django's signed,
HTTP-only session cookie) gates every non-login API route. No per-resource
permission model, consistent with the single-user/single-household
non-goal above - and no custom auth code to write or maintain.

### Deployment: docker-compose
Three services: `db` (Postgres), `backend` (Django, served via gunicorn),
`frontend` (static React build served via nginx, or served directly by
the backend via whitenoise for v1 to minimize moving parts - final choice
left to implementation but should not block the API design). Single
`docker-compose.yml` for self-hosting, matching the project's
Firefly-III-style self-hosting goal.

## Risks / Trade-offs

- [On-read balance computation could slow down as transaction count grows
  per account] → Mitigate with a DB index on `(account_id, date)`; revisit
  with a cached/derived balance only if real usage shows it's needed.
- [Fuzzy-match duplicate detection can produce false positives or
  negatives] → The `transaction-import` spec already requires a preview
  step where the user can override any flag before committing, so a
  wrong guess here is correctable, not silently destructive.
- [OFX files vary across banks and can be malformed] → Use a maintained
  parsing library and surface parse failures as a rejected upload with an
  explanation, per the `transaction-import` spec's upload requirement,
  rather than attempting best-effort recovery.
- [Single-currency assumption may not fit every user's situation] →
  Explicitly scoped as a non-goal; revisit as its own change if needed,
  since it touches the data model broadly enough to warrant its own
  proposal rather than being folded in here.

## Migration Plan

Greenfield project - no production data or running system to migrate.
- Initial Django migration(s) create the full v1 schema (accounts,
  transactions, categories, category_limits, recurring_transactions,
  import_sessions).
- `docker-compose up` brings up `db`, `backend`, `frontend` together for
  first deployment. No rollback strategy is needed beyond tearing down
  the compose stack, since there is no prior state to preserve.

## Open Questions

- Should category limits support rollover (unused budget carrying to the
  next month)? Current spec is a flat per-month limit with no rollover.
  Safe to defer: adding rollover later is additive and doesn't change the
  v1 data model or requirements above.
- Exact fuzzy-match threshold (0.8) for duplicate detection is a starting
  value, not user-validated. Safe to tune post-launch without changing
  the spec, which only requires that likely duplicates are flagged and
  overridable.

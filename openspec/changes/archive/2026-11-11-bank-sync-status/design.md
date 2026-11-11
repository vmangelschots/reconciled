# Design

## Context

See proposal.md for motivation. Today `BankConnections.jsx` loads
`GET /api/bank-sync/` itself and holds a `syncing` flag only for its own
click. `POST /api/bank-sync/run/` runs `sync_all` synchronously and returns
`{running, added}`, with `running: true` when `household_lock()` (a
PostgreSQL advisory lock per household, also taken by restore) is already
held. Each link stores `last_synced_at` (set only on success),
`last_added_count` and `last_error`. The schedule exists only in
`k8s/35-bank-sync.yaml` (`30 6,18 * * *`). `docker-compose.yml` runs no
scheduled sync. `Layout.jsx` already wraps pages in
`ReviewCountProvider`/`AccountsProvider` with a `refreshKey`, and Overview
reloads through `useReport(load, key)`, which refetches when `key` changes.

## Goals / Non-Goals

**Goals:**
- One source of bank-sync state in the frontend, shared by the header status
  and Settings, so they can't disagree.
- A running sync is visible however it was started, without the backend
  storing a flag that can go stale.
- Pages refresh their data when a sync ends, through the mechanism they
  already use.

**Non-Goals:**
- Making `run/` asynchronous (a job queue). A sync of a few links takes
  seconds. The request stays synchronous.
- Push updates (websockets/SSE). Polling while a sync runs is enough.
- Reading the schedule from Kubernetes.

## Decisions

**Running = the advisory lock is held, read from `pg_locks`.**
`GET /api/bank-sync/` adds `running`, true when `pg_locks` has an advisory
lock with `classid = SYNC_LOCK` and `objid = household pk` (two-int form,
`objsubid = 2`). A helper next to `household_lock()` in `sync.py` keeps the
lock's identity in one place. Alternative: a `sync_started_at` column set and
cleared around `sync_all`. Rejected, because a killed CronJob pod leaves it
set, and the lock is released by PostgreSQL when the session ends. Restore
takes the same lock, so the status also shows "Syncing…" during a restore.
That is acceptable: no sync can start then anyway.

**Next sync from a `BANK_SYNC_TIMES` setting.** It holds a comma-separated
list of times (`"06:30,18:30"`) in UTC, as the CronJob's schedule is (it has
no `timeZone`, and Django's `TIME_ZONE` is UTC). `next_sync_at` is the next of
those instants after now, as an ISO timestamp, or `null` when the list is
empty (the default, and docker-compose's case). The browser shows it in
local time, as it does `last_synced_at`. The k8s config map sets it
next to the CronJob, with a comment in both places that they must match.
Alternative: a cron string parsed with `croniter`. Rejected, because it adds
a dependency for a schedule that is a list of daily times.

**`run/` stays as it is.** Its response already tells the frontend
everything it needs. The frontend shows "Syncing…" while the request is
pending. When the response says `running: true`, it polls instead.

**`BankSyncProvider` in `Layout.jsx`.** It owns `GET /api/bank-sync/` and
exposes `status`, `reload()`, `syncNow()`, a `version` number and the
transient `result`. It loads on mount and household change, after
`syncNow()`, and every 3 s while `status.running` is true. When a sync ends
(a `run/` response, or `running` going from true to false while polling),
it bumps `version` and sets `result` (`{added}`, or `{added: null}` after a
poll, which doesn't know the count) for 5 s. A failed `run/` shows
`toast.error` and no result. `BankConnections.jsx` reads and reloads through
the provider instead of loading on its own.

**Pages refresh through `version`.** `version` joins the `refreshKey` of
`AccountsProvider` and `ReviewCountProvider`, so sidebar balances and the
Review count follow. Overview appends it to its `useReport` keys, and
Accounts and Transactions add it to the effect that calls their `reload()`.
That keeps the rule that loaded lists stay visible while they refresh.

**Summary derived in the frontend.** A small pure function
`syncSummary(status)` in `lib/bankSync.js` builds the label state from
links (connection accounts' links plus `waiting_links`): hidden unless
`enabled` and at least one link; `stopped` when `credentials.stopped`;
`running`; otherwise the latest `last_synced_at` and an issue count (links
with `last_error`, links on an ended connection, waiting links). Being pure,
it covers the spec's scenarios in unit tests. The time is formatted as
`HH:mm` today, "yesterday HH:mm", or `d MMM HH:mm`, with one shared formatter
also used by the per-link line in Settings.

**`BankSyncStatus` component, one for all places.** It is a ghost `sm`
button with `RefreshCw` (spinning while running) and the label, in warning
colour when there are issues or bank sync stopped. It opens a Radix Popover
(already used by `CategoryCombobox`) with one row per link, Reconnect where a
connection has ended (reusing `authorizeBank`), a link to
`/settings#bank-connections` when stopped, "Next sync HH:mm" when
`next_sync_at` is set, and a Sync now button. Pages put it in `PageHeader`'s
`actions` before their primary action. Settings puts it in the Bank
connections `Panel`'s `actions` before the credentials badge, and the
Connect row loses the button. Below `sm`, the label drops "Synced".

## Risks / Trade-offs

- [`BANK_SYNC_TIMES` drifts from the CronJob schedule] → comments in both
  files, and the times sit next to each other in `k8s/`. A wrong value only
  misstates "Next sync".
- [A long sync holds an HTTP request open] → unchanged from today. If a
  request times out at the proxy, the provider still polls on the next load
  and shows "Syncing…" until the lock is released.
- [Polling every 3 s] → only while `running` is true and the app is open,
  and it stops when the sync ends.
- [Status shown during a restore] → acceptable, see above.

## Migration Plan

No migration. Deploy the backend and frontend together. Add
`BANK_SYNC_TIMES: "06:30,18:30"` to the k8s config map. Without it, the app
works and shows no next sync. To roll back, revert the change. The extra
fields in `GET /api/bank-sync/` are ignored by the old frontend.

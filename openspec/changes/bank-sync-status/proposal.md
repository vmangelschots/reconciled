# Proposal

Issue: #49

## Why

The only way to sync is "Sync now" in Settings, on the same row as "Choose a
bank" and "Connect", so it reads as a step in adding a bank, not "get my latest
transactions". Settings is where banks are set up, not where people check
whether their numbers are current. The app also never says when it last synced:
each link shows only a date, which tells little when syncs run twice a day.
Nothing shows when the next sync runs, or that a scheduled sync is running now.

## What Changes

- A bank sync status in the page header of Overview, Accounts and
  Transactions, shown when bank sync works and at least one bank account is
  linked. It reads "Synced 18:32", "Syncing…", or a warning when something
  needs attention.
- Opening it shows one row per linked account (bank, ledger account, last sync
  time and lines added, or its error), Reconnect for an ended consent, when the
  next scheduled sync runs, and Sync now.
- A sync stays household-wide, one at a time, as today. When a sync is already
  running (the scheduled one or another member's), the status shows
  "Syncing…" until it ends, and pressing Sync now starts nothing new.
- When a sync ends, the open page refreshes its data in place, and the status
  briefly shows the result ("Synced just now, +5"). A failure shows as a toast,
  but success no longer does.
- Settings: Sync now moves off the Connect row into the Bank connections
  panel header, as the same sync status. Choosing a bank and Connect stand on
  their own. Each link shows its last sync with the time ("11 Nov 18:32").
- The status API reports whether a sync is running, and when the next
  scheduled sync is. The schedule is set once in deployment configuration,
  next to the CronJob. Without it, nothing about the next sync is shown.

Not in this change: per-account or per-bank sync, syncing in the background
when a page opens, and changing how often the scheduled sync runs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `bank-sync`: manual sync moves from a Settings-only button to a sync status
  available on Overview, Accounts, Transactions and Settings. Last sync shows a
  time, and the API reports a running sync and the next scheduled one.
- `ui-shell`: the page header of Overview, Accounts and Transactions carries
  the sync status. Sync now's success is shown in place instead of as a
  notification.

## Impact

- `backend/banksync/views.py`, `backend/banksync/sync.py`: `running` and
  `next_sync_at` in `GET /api/bank-sync/`. `backend/config/settings.py`: a
  `BANK_SYNC_TIMES` setting.
- `k8s/` config map: `BANK_SYNC_TIMES` matching the CronJob schedule.
  `docker-compose.yml` runs no scheduled sync and stays as it is.
- Frontend: a new `BankSyncStatus` component with a popover, a shared
  bank-sync state that pages can reload from, `BankConnections.jsx`, and the
  headers of `OverviewPage.jsx`, `AccountsPage.jsx` and `TransactionsPage.jsx`.
- No migration, and no new dependency (Radix popover is already used).

# Tasks

## 1. Backend status

- [ ] 1.1 Add a `sync_running()` helper beside `household_lock()` in `backend/banksync/sync.py` that reads `pg_locks` for the household's lock, and return it as `running` from `StatusView`. Verify in `backend/banksync/tests.py`: false when idle, true while another connection holds the household's lock, false for another household's lock.
- [ ] 1.2 Add `BANK_SYNC_TIMES` to `backend/config/settings.py` (comma-separated `HH:MM` in UTC, default empty) and return `next_sync_at` from `StatusView`. Verify with tests: the next time later today, wrapping to tomorrow after the last time, `null` when empty, and an invalid entry failing at startup with a clear message.
- [ ] 1.3 Set `BANK_SYNC_TIMES: "06:30,18:30"` in `k8s/10-config.yaml`, with comments there and in `k8s/35-bank-sync.yaml` that both must match. Verify the manifests pass kubeconform as CI runs it.

## 2. Shared sync state

- [ ] 2.1 Add `syncSummary(status)` and the sync time formatter to `frontend/src/lib/bankSync.js`. Verify with unit tests for each "Sync status" and "Sync problems show in the status" scenario: hidden, not synced yet, today/yesterday/earlier, running, one issue, ended consent, waiting link, stopped.
- [ ] 2.2 Add `BankSyncProvider` (status, `reload`, `syncNow`, `version`, `result`, polling while running) and mount it in `Layout.jsx`, with `version` joining the `refreshKey` of `AccountsProvider` and `ReviewCountProvider`. Verify with tests using fake timers: `syncNow` bumps `version` and sets `result` for 5 s; a `running: true` response polls until running is false, then bumps `version`; a failed run shows an error toast and no result.

## 3. Sync status component

- [ ] 3.1 Build `frontend/src/components/BankSyncStatus.jsx`: ghost button with label and spinning icon, warning colour, the popover's link rows, Reconnect, the Settings link when stopped, "Next sync", and Sync now disabled while running. The label drops "Synced" below `sm`. Verify in `BankSyncStatus.test.jsx` against the "Sync status details", "A running sync shows as running" and "Sync problems show in the status" scenarios.

## 4. Pages

- [ ] 4.1 Put `BankSyncStatus` in the `PageHeader` actions of `OverviewPage.jsx`, `AccountsPage.jsx` and `TransactionsPage.jsx`, before the primary action, and refresh each page's data when `version` changes (Overview's `useReport` keys, the others' `reload` effects). Verify in each page's tests: the status shows with linked accounts, is absent without them, and a bumped `version` refetches while the loaded rows stay visible.
- [ ] 4.2 Rework `BankConnections.jsx` to read and reload through the provider. Put `BankSyncStatus` in the panel's `actions` before the credentials badge, remove Sync now and the success toast from the Connect row, and show the time in each link's "Last sync" line. Verify in `BankConnections.test.jsx`: "Last sync 11 Nov 18:32, 3 lines added", no Sync now on the Connect row, and the status in the panel header.

## 5. Whole change

- [ ] 5.1 Run `python manage.py test` in `backend/`, and `npm test`, `npm run lint` and `npm run build` in `frontend/`. Verify all pass.
- [ ] 5.2 In the running app with a linked bank, press Sync now on Accounts and check the status goes "Syncing…" → "Synced just now, +N" → "Synced HH:mm" and the new lines appear without a reload. Check a phone-width header, and that Settings shows the status in the panel header. Verify by screenshots.

## Workflow follow-up

- Open a GitHub issue for this change (enhancement, Reconciled project) and add "Issue: #N" to proposal.md, if the user wants one.
- Archive the change on its branch before the PR is merged.
- Open the PR with `Fixes #N`, and mention that `BANK_SYNC_TIMES` needs adding to existing k8s config maps.

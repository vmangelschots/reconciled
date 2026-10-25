# Tasks

## 1. Backup format

- [ ] 1.1 Create the `backup` Django app with no models and add it to
  `INSTALLED_APPS`. In `backup/format.py`:
  - list `BACKED_UP_MODELS` and `EXCLUDED_MODELS` (design D2);
  - document the version rule in the docstring (D4);
  - add a test that fails when any model in `accounts`, `budgets`,
    `transactions`, `forecasting` or `imports` is in neither list.

  Verify that the test passes and that it fails when a model is removed
  from `BACKED_UP_MODELS`.
- [ ] 1.2 Write `build_backup()`, which returns the envelope from D1:
  - `app`, `format_version: 1`, `exported_at`;
  - the latest applied migration per backed-up app;
  - `summary`, with accounts and ledger-row transactions;
  - `data`.

  Committed import sessions are exported with their file content and
  candidates emptied, and pending sessions are left out. Users, sessions and
  admin data are never included.

  Verify with tests that the file holds every listed model's rows with ids
  and timestamps, that the counts are right, that no `auth` rows or password
  hashes are present, that no pending session is present, and that no
  committed `raw_content` or candidates are present.

## 2. Restore

- [ ] 2.1 Write `read_backup(data)`, which checks and deserializes without
  writing (D3 step 1). It raises a `BackupError` with the spec's messages:
  - not a Reconciled backup;
  - can't be read;
  - unknown format version;
  - made by a newer version (an unknown migration name);
  - a model that isn't backed up.

  Verify with a test per message, and check that the data is untouched after
  each.
- [ ] 2.2 Write `restore_backup(objects)` (D3 step 2):
  - TRUNCATE the backed-up tables and the `imported_accounts` through table,
    with RESTART IDENTITY CASCADE;
  - raw-save every object, including its M2M;
  - reset the sequences;
  - do all of this in one `atomic()` block, and turn a database error into a
    `BackupError`.

  Verify with tests:
  - a round trip (backup, change the data, restore) gives identical rows,
    including a linked transfer, a split with parts, an unconfirmed AI guess
    with its reason, a value adjustment, limits, yearly budgets, budget
    settings, recurring transactions and remembered import settings;
  - the Overview's last-import date is the same after a restore;
  - a pending import is gone after a restore;
  - a new transaction created after the restore saves without an id clash;
  - a backup with a transaction pointing at a missing account fails and
    leaves the data unchanged;
  - an older-format fixture with a transaction field left out restores, and
    that field takes its default.

## 3. API

- [ ] 3.1 Add `GET /api/backup/`. It returns the envelope as JSON with
  `Content-Disposition: attachment; filename="reconciled-backup-YYYY-MM-DD.json"`.

  Verify with tests for the status, the header, the body, and 401 without a
  session.
- [ ] 3.2 Add `POST /api/backup/restore/` (multipart `file`). It returns
  `{"accounts": n, "transactions": m}` on success, or 400 with `detail` from
  `BackupError`. A missing file also gets a 400.

  Verify with API tests for a successful restore, a damaged file, a newer
  version and no file. Also check that the client's session still works for
  a request after the restore (it stays signed in), and that an
  unauthenticated request gets 401.

## 4. Frontend

- [ ] 4.1 Add `api/backup.js`:
  - `downloadBackup()`: a credentialed fetch, then a blob, then a temporary
    `<a download>` using the server's filename;
  - `restoreBackup(file)` through `apiUpload`;
  - `readBackupSummary(file)`, which parses the JSON in the browser and
    rejects files without `app === "reconciled"`.

  Verify with vitest tests for `readBackupSummary` (a valid file, a CSV, cut
  off JSON) and for the download error path.
- [ ] 4.2 Add `SettingsPage` at `/settings` (D7). It has:
  - a Backup card with a Download backup button that shows a success toast,
    or an error toast on failure;
  - a Restore… button with a hidden file input;
  - a confirm Dialog showing "Made 20 Oct 2026 · 3 accounts · 1,204
    transactions" and the replace-everything warning, with Cancel and a
    destructive "Replace everything" button that spins while the upload
    runs;
  - an error toast for a file that isn't a backup;
  - after success, the toast "Restored N accounts and M transactions" and
    navigation to `/`.

  Verify with vitest tests for download, the not-a-backup error, the
  summary in the confirm, cancel (no upload), a successful restore
  (toast and navigation) and a server error toast.
- [ ] 4.3 Add Settings after Accounts in `Layout.jsx` (the `more` group,
  lucide `Settings` icon) and the route in `App.jsx`.

  Verify by updating `Layout.test.jsx` so the sidebar and the More sheet
  list Settings after Accounts. `npm test`, `npm run lint` and
  `npm run build` must pass.

## 5. Deployment and end-to-end check

- [ ] 5.1 Add `nginx.ingress.kubernetes.io/proxy-body-size: "50m"` to
  `k8s/50-ingress.yaml` (D8).

  Verify that kubeconform validates the manifests as CI does.
- [ ] 5.2 Run the end-to-end check against a throwaway Postgres (not the
  local stack's database):
  1. import a Crelan CSV and categorize a few lines;
  2. download a backup from the Settings page in the running app;
  3. delete an account and add a transaction;
  4. restore the backup.

  Verify that the accounts, balances, Review count and last-import dates
  match what they were before step 3, that the user is still signed in, and
  that the confirm dialog and both buttons fit at 390px wide. Note the
  results in this task.

## Workflow follow-up

- Create the GitHub issue (`enhancement`, project Reconciled) and add
  "Issue: #N" to proposal.md.
- Archive `data-backup` on `change/data-backup`, then open the PR with
  `Fixes #N`.

# Proposal

Issue: #27

## Why

All of the user's budget history lives in one self-hosted Postgres database,
and the only way to get it out today is `pg_dump` on the server. A bad
import, a broken upgrade or a lost volume means years of categorized
transactions are gone. The user wants to make a backup from the app itself,
in one click, and be able to put it back just as easily.

## What Changes

- A new **Settings** page, reached from the navigation after Accounts, with a
  Backup section.
- **Download backup**: one button that downloads a single JSON file
  (`reconciled-backup-YYYY-MM-DD.json`) holding all of the user's data:
  - accounts;
  - transactions, with their splits, transfer links, value adjustments and
    category guesses;
  - categories and tabs;
  - monthly limits, yearly budgets and the budget settings;
  - recurring transactions;
  - the remembered import mappings;
  - when each account was last imported into.
- **Restore backup**: pick a backup file and see what it holds (when it was
  made, and how many accounts and transactions). After a clear warning, the
  restore **replaces everything** in the app with the backup's data, exactly
  as it was.
  - The restore is all or nothing. If the file is invalid, or was made by a
    newer version of the app, nothing changes.
- Left out of the backup:
  - login users, so the person restoring stays signed in;
  - unfinished imports and the bank files they were uploaded from.
- The Kubernetes ingress allows uploads large enough for a backup.

## Capabilities

### New Capabilities
- `data-backup`: making a backup file of the user's data, what it holds and
  leaves out, and restoring one (replace-all, checked first, all or nothing,
  refused when made by a newer version).

### Modified Capabilities
- `ui-shell`: the Responsive navigation requirement adds Settings, after
  Accounts in the sidebar and in the More sheet on narrow screens.

## Impact

- Backend:
  - A new `backup` Django app with no models. It holds the backup format
    (what is dumped, in which order) and two endpoints:
    `GET /api/backup/` and `POST /api/backup/restore/`.
  - Login is required, as for every other endpoint.
- Frontend:
  - A new `SettingsPage` and an `api/backup.js`.
  - A route and a navigation item in `Layout.jsx`.
- Deployment:
  - A `proxy-body-size` annotation on `k8s/50-ingress.yaml`; ingress-nginx's
    default 1 MB would reject a restore of a few thousand transactions.
- No migrations and no new dependencies.
- Out of scope:
  - scheduled or server-side automatic backups, and a command-line backup
    command (both are possible follow-ups built on the same format);
  - merging a backup into existing data;
  - encrypting the file.

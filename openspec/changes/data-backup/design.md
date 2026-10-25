# Design

## Context

- All of the user's data sits in nine models across five apps:
  - `accounts.Account`;
  - `transactions.Transaction`, with self-links for `transfer_counterpart`
    and `split_parent`;
  - `budgets.Category` (self-link `parent`), `CategoryLimit`, `YearlyBudget`
    and `BudgetSettings`;
  - `forecasting.RecurringTransaction`;
  - `imports.ImportSession` (with the `imported_accounts` M2M) and
    `imports.AccountImportSettings`.
- The Overview's last-import reminder is computed from
  `Max(updated_at)` of committed `ImportSession`s per `imported_accounts`.
  A backup therefore has to carry committed sessions and their timestamps.
- Every Postgres FK Django creates is `DEFERRABLE INITIALLY DEFERRED`. Inside
  one transaction, rows can be inserted in any order, including
  self-referencing ones. A dangling FK fails when the transaction commits.
- Auth is session-based (`SessionAuthentication401`), with `IsAuthenticated`
  as the default permission. Sessions and users live in tables the restore
  never touches.
- The published deployment puts ingress-nginx in front of the backend, and
  its default `proxy-body-size` is 1 MB.

## Goals / Non-Goals

**Goals:**
- Restoring a backup gives back exactly the same rows: same ids, same
  timestamps, same links.
- Nothing is written until the whole file has been read and checked. Once
  writing starts, it happens in one database transaction.
- When someone adds a model to a data app later, they have to decide whether
  it goes in the backup.

**Non-Goals:**
- Moving data between installs that already hold data (merge, id
  remapping).
- Restoring into a database that isn't Postgres. The app only supports
  Postgres.
- Making backups faster or smaller for very large data sets. One household's
  data is a few MB of JSON.

## Decisions

### D1. One JSON file, made with Django's serializers

The backup is Django's "python" serialization of each model,
`{"model", "pk", "fields"}`, wrapped in an envelope:

```json
{
  "app": "reconciled",
  "format_version": 1,
  "exported_at": "2026-10-25T14:03:00Z",
  "migrations": {"accounts": "0006_…", "budgets": "…", "transactions": "…",
                 "forecasting": "…", "imports": "0004_backfill_imported_accounts"},
  "summary": {"accounts": 3, "transactions": 1204},
  "data": [{"model": "accounts.account", "pk": 1, "fields": {…}}, …]
}
```

- **Why:** the serializers already handle every field type, M2M and pk. Raw
  saves on load keep `auto_now`/`auto_now_add` values as they are in the
  file, so last-import dates and created times survive. JSON is readable and
  diffable, which helps a self-hoster check their own backup.
- **Alternatives:**
  - `pg_dump` from the API: needs the client binaries in the image, isn't
    portable across Postgres major versions, and is hard to check before
    restoring.
  - `dumpdata`/`loaddata` management commands: they need shell access, and
    `loaddata` merges by pk instead of replacing.
  - A hand-written per-model format: more code to maintain for no benefit.

### D2. The list of backed-up models lives in one place

`backend/backup/format.py` holds:

- `BACKED_UP_MODELS`: the nine models above, in dependency order (that
  order only matters for readability, see Context);
- `EXCLUDED_MODELS`: currently none in the data apps.

Committed `ImportSession`s are exported with `raw_content=""` and
`candidates=[]`, so no bank file content is kept. Pending sessions are left
out. A test lists every model in `accounts`, `budgets`, `transactions`,
`forecasting` and `imports`, and fails if one is in neither list.

- **Alternative:** dump whole apps. That would quietly pull in raw bank
  files, and quietly leave out whatever a later change adds elsewhere.

### D3. Restore = check, then truncate and insert in one transaction

`POST /api/backup/restore/` takes a multipart `file`.

1. **Read and check** (no writes):
   - parse the JSON;
   - require `app == "reconciled"` and a known `format_version`;
   - check the migration names against the loader's graph;
   - require every `model` to be in `BACKED_UP_MODELS`;
   - deserialize every object with `serializers.deserialize("python", …,
     ignorenonexistent=True)` into a list. This catches bad field values
     before any delete.
2. **Write**, inside `transaction.atomic()`:
   - `TRUNCATE … RESTART IDENTITY CASCADE` the nine tables and the
     `imported_accounts` through table;
   - `save()` each deserialized object, a raw save that also sets its M2M;
   - reset each table's id sequence with
     `connection.ops.sequence_reset_sql`.

   Saving raw also tells the value-adjustment signal handlers to skip
   their recompute, so adjustments aren't recalculated from a half-loaded
   ledger and keep their stored amounts and times.

   An `IntegrityError` raised by the deferred FK check at commit (a dangling
   link) or any other database error rolls everything back. The endpoint
   then returns 400 with a plain reason.

- **Why TRUNCATE:** it is transactional in Postgres, doesn't load every row
  the way the ORM's cascade collector does, and pending imports go with it.
- **Why reset sequences:** restored rows keep their ids, so the next
  insert's sequence value must start after the largest restored id.
- **Alternative:** deleting through the ORM. That is slower and walks the
  `SET_NULL`/`CASCADE` rules for nothing, since everything is going anyway.

### D4. Version rules

- **`format_version`:** the envelope's own shape. This change uses 1. A
  higher value, or a missing one, is refused.
- **`migrations`:** the latest applied migration of each backed-up app when
  the backup was made.
  - If a name isn't in this install's migration graph, the backup comes from
    a newer app. It is refused with the "newer version" message.
  - Older names are fine. Fields added since then take their model default,
    because the deserializer only sets the fields it gets, and
    `ignorenonexistent` drops a field that was later removed.
- **Rule for future changes:** a migration that reshapes existing data (not
  just adding a field with a default) has to bump `format_version` and add a
  converter in `format.py` from the previous version. This rule is written
  down in `format.py`'s docstring.

### D5. The frontend reads the summary itself

When a file is picked, the Settings page reads it with `file.text()` and
`JSON.parse`, and checks `app === "reconciled"`.

- If the check passes, the confirm dialog shows `exported_at` and
  `summary`.
- If it fails, the page shows "This file isn't a Reconciled backup" right
  away.
- **Confirm** uploads the same `File` with `apiUpload`. The server does the
  real checks (D3).
- **Alternative:** a server "check" endpoint. That means a second upload and
  a second code path, just to show two numbers the file already carries.

The download is a credentialed `fetch` of `GET /api/backup/`, turned into a
blob and saved through a temporary `<a download>`. A plain link would skip
the app's API base URL in development and wouldn't let a failure show as a
toast. The server sends `Content-Disposition` with the dated filename, and
the client uses the same name.

### D6. After a restore

The page:

1. shows the success toast "Restored N accounts and M transactions";
2. navigates to `/` (Overview).

`AccountsProvider` refreshes on a pathname change, so the sidebar balances
and Review count reload without a full page reload, and the toast stays
visible. The restore never touches the session or user tables, so the user
stays signed in.

### D7. Settings page and navigation

- `SettingsPage` at `/settings` has a `PageHeader` "Settings" and one Card,
  "Backup", with two rows:
  - **Download a backup**: "Everything in Reconciled in one file. Keep it
    somewhere safe." with a Download backup button;
  - **Restore from a backup**: "Replaces everything in the app with the
    backup." with a Restore… button that opens a hidden file input
    (`accept=".json,application/json"`).
- The confirm uses the existing `Dialog`, with a destructive "Replace
  everything" button and a spinner while the upload runs.
- In `Layout.jsx`, Settings (lucide `Settings` icon) goes after Accounts in
  the `more` group.

### D8. Ingress body size

Add `nginx.ingress.kubernetes.io/proxy-body-size: "50m"` to
`k8s/50-ingress.yaml`. Django's own limits don't apply to file parts. The
annotation also lifts the same 1 MB ceiling for large bank CSVs.

## Risks / Trade-offs

- **[A future migration changes data in a way an old backup can't express]**
  → D4's rule, together with the D2 coverage test, makes the author think
  about the backup. A `format_version` bump is cheap.
- **[The restore replaces data the user wanted to keep]** → The confirm
  states what will be replaced, and shows the backup's date and counts. The
  Download button sits right above Restore, so making a fresh backup first is
  one click.
- **[A large backup gets close to request timeouts]** → At household scale
  (tens of thousands of rows) the restore is a few seconds of inserts. If
  that ever grows, `bulk_create` per model (with M2M set afterwards) is a
  drop-in speed-up.
- **[The file holds all financial data in plain text]** → The download is
  behind login like the rest of the app. Encrypting the file is out of scope
  (proposal).
- **[A backup lists a migration an install later squashes or renames]** →
  The newer-version check would then refuse a valid older backup.
  Squashing isn't done in this repo. If it ever is, `format.py` maps the old
  names.

## Migration Plan

- No schema migrations. The feature ships with the next image.
- Self-hosters on Kubernetes reapply `50-ingress.yaml` to pick up the body
  size. Without it, Download still works and only large restores fail with a
  413.
- Rollback: redeploy the previous image. Backups made in the meantime stay
  valid for this version (D4).

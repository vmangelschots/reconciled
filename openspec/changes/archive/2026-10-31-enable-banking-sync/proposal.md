# Proposal

## Why

Keeping the ledger current means downloading a CSV per bank and walking it
through the Import page, so the budget is only as fresh as the last upload.
Enable Banking offers read access to the household's own accounts through
PSD2 APIs, with a mode meant for individual non-commercial use, so the app
can fetch new lines by itself.

## What Changes

- Connect a bank from Settings through Enable Banking and link its accounts
  to ledger accounts, each with a start date.
- Sync linked accounts on a schedule and with a Sync now button. New lines
  go straight into the ledger with no preview: file imports keep their
  preview, sync does not.
- Recognize lines by the bank's reference, and remember every line seen so
  a deleted line doesn't come back.
- Adopt a matching line that is already in the ledger without a bank
  reference, rather than adding it twice.
- Confirm created transfer counterparts automatically, and link a transfer
  between two linked accounts when there is exactly one match.
- Categorize new lines and update loan payments after each sync, as after
  a file import. Guesses wait on the Review page.
- Warn on the Overview before a bank consent ends, and count a sync as an
  import for the stale-import reminder.
- Run the sync as a scheduled job in the Kubernetes manifests, off unless
  Enable Banking credentials are configured.
- Crelan and Revolut are both linked. Revolut's API doesn't expose pockets
  as accounts, so the user records pocket moves by hand as transfers.

Out of scope: payments, showing pending lines, a holding queue for
uncertain lines, comparing bank balances with the ledger, and changes to
CSV and OFX import.

## Capabilities

### New Capabilities

- `bank-sync`: Connecting banks, linking their accounts, fetching new lines
  into the ledger and everything that happens to those lines automatically.

### Modified Capabilities

- `overview`: Needs attention gains a reconnect line, and the stale-import
  reminder takes syncs into account.
- `data-backup`: A backup holds account links and seen bank lines, but no
  bank sessions or keys.
- `deployment`: A scheduled sync job, and Enable Banking credentials in the
  Kubernetes Secret.

## Impact

- Backend: a new Django app with models, an Enable Banking client, API
  endpoints and a management command; the shared parts of import commit
  are moved out of `imports/views.py` so sync can call them; the Overview
  and backup format change.
- Frontend: a bank connections section in Settings, the redirect back from
  the bank, and a new Needs attention line.
- Dependencies: PyJWT and cryptography, for signing API requests.
- Deployment: a CronJob, an Enable Banking app registration and an RSA
  private key in the Secret.
- External: `api.enablebanking.com` receives requests from the backend, and
  bank data passes through Enable Banking.
- `openspec/config.yaml`: its "no live bank sync" note is updated.

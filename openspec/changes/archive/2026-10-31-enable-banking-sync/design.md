# Design

## Context

See proposal.md for motivation and `specs/bank-sync` for behavior.

Import today runs upload -> candidates -> preview -> commit, in
`imports/views.py`. Candidates are already independent of the file format,
but `commit` lives on the viewset and takes the user's selection. There is
no background worker or cron, the backend is one Deployment, and optional
integrations are switched on by an environment variable (`OPENAI_API_KEY`).

Enable Banking facts that shape this: requests are signed with an RS256 JWT
using the app's private key; a bank is authorized by `POST /auth`, a browser
redirect and `POST /sessions`; consent is capped per bank, mostly at 180
days; a new session means new account IDs, while `identification_hash`
stays the same; `entry_reference` is mostly unique and stable per account,
but some banks omit or repeat it; `transaction_id` can change; many banks
allow 4 background fetches a day; and full history is often limited to 90
days an hour after authorization.

Crelan was measured on 124 lines across 3 accounts: `entry_reference` was
always present, never repeated within a fetch, and unchanged between two
fetches in one session; `transaction_id` is always empty; all lines were
booked. Stability across a reconnect relies on the documented guarantee.
Crelan and Revolut are both listed for Belgium with personal access and a
180-day maximum consent. The redirect to the production hostname works.
Revolut offers only its EUR and GBP current accounts, with no pockets, and
both its `creditor` and `debtor` are usually filled.

Enable Banking's terms limit production use with linked accounts to
evaluation or the personal use of private individuals, which fits this app.
The number of linked accounts per application may be capped; the terms give
no number. Each self-hoster registers their own application.

## Goals / Non-Goals

**Goals:**
- Sync and file import share one path from "a parsed line" to "a ledger
  transaction", so they can't drift apart.
- A sync can be repeated at any time with no effect on lines already seen.

**Non-Goals:**
- A general multi-provider abstraction. Enable Banking is the only provider
  and the client stays a small module.
- Importing history. History comes from file imports; sync starts at the
  link's start date.

## Decisions

### A new `banksync` Django app

Models, with `account_hash` being Enable Banking's `identification_hash`:

- `BankConnection`: bank name, session ID, `valid_until`, ended state.
- `BankAccountLink`: nullable connection, `account_hash`, bank account ID
  for the current session, ledger account, `start_date`, `last_synced_at`,
  `last_added_count`, `last_error`.
- `SeenBankLine`: `account_hash`, `reference`, nullable transaction
  (`SET_NULL`), unique on the first two.

`SeenBankLine` is keyed by hash, not by link, so it survives disconnecting
and reconnecting. Alternative rejected: an external ID field on
`Transaction`. It can't remember a deleted line, which is exactly what a
sync's overlapping window needs. The nullable transaction also answers
"has a bank line been matched to this row?" for adoption.

### Sync runs per link, then finishes as one

```
for each link:  fetch --> skip seen --> confirm counterpart | adopt | create
                (atomic per link: lines and last_synced_at together)
then, once:     link transfers --> categorize --> sync_loans
```

Linking runs after every link is done, so two sides from one run can meet,
and before categorizing, so they get no guess. Categorizing stays outside
the atomic blocks, as in `commit`, so an AI failure can't roll lines back.

The fetch window starts at the later of `start_date` and
`last_synced_at` minus 10 days, which catches lines the bank books late.
`last_synced_at` only moves on success, so a failed period is retried.

### Adoption narrows fuzzy matching instead of removing it

Adoption reuses the date, amount and `_is_similar` payee check of
`flag_duplicates`, but only against rows with no `SeenBankLine`. Two synced
payments with different references can therefore never hide each other,
while a hand-entered line or a CSV line uploaded to a linked account isn't
doubled. Alternative rejected: no adoption at all, which relies on the user
never importing a file into a linked account.

### Reference fallback

The reference is `entry_reference`, unless it is empty or repeated within a
fetch. Then it is a hash of date, amount, payee and the line's position
among identical lines that day. `transaction_id` is not used because it can
change between fetches. This is safe to build before knowing Crelan's data.

### Mapping keeps Crelan lines identical to its CSV

A bank line maps to the same candidate shape as a file row. Per-bank
differences stay in one small mapping table keyed by bank, and the default
is the Crelan behavior measured on 87 lines matched to a CSV export:

- Date: `transaction_date`, then `booking_date`. Crelan leaves
  `transaction_date` empty and its CSV `Datum` equals `booking_date` on all
  87 lines. `value_date` is skipped: it differed on 12 of them, so it would
  break adoption and move lines between months.
- Payee: `creditor` for a debit and `debtor` for a credit, then the first
  `remittance_information` entry. Only one of the two names was ever filled.
- Notes: the first `remittance_information` entry. It is "Mededeling", or
  "Type verrichting" when there is no Mededeling, the same as the Crelan
  preset's description. The second entry is "Type verrichting", which isn't
  used.

Revolut uses the same default for now. Its CSV import dates a line by
`Started Date`, and whether that is `value_date` wasn't measured, so a card
payment may land on a later day than it would from a file. `DATE_FIELDS`
takes a Revolut entry if it does.

Counterparty names were equal to the CSV on 84 of 86 lines, and the other 2
weren't similar enough for adoption, which is the accepted payee risk below.

### Share commit, keep the preview out of it

The creation, counterpart and after-posting steps of `commit` move to
`imports/ledger.py`, and the viewset calls them. `link_pair` is reused for transfers. It clears the category but doesn't
reset `category_confirmed`, `category_source` or `category_reason`, so it
gets that reset here; pocket moves are new rows, where it made no
difference.

### Automatic counterpart confirmation picks the closest date

Import's preview lets the user untick a wrong match. Sync can't, so when
several created counterparts match it takes the closest date, which is what
`Link to a matching transaction` does for manual transfers.

### Scheduling is a Kubernetes CronJob

`python manage.py sync_banks` runs from the backend image at 06:30 and
18:30, with `concurrencyPolicy: Forbid`. Twice a day stays well under 4
background fetches, leaving room for Sync now. Alternative rejected: Celery
or a scheduler in the backend pod, which adds a broker or duplicates runs
for one small job.

Overlap between cron and Sync now is prevented by a PostgreSQL advisory
lock held for the whole run; the unique constraint on `SeenBankLine` is the
backstop. Sync now runs inside the request and sends the PSU headers that
mark it as user-initiated. A run takes seconds for a household, so no job
queue is warranted.

### Authorization flow

Settings calls the backend, which starts `POST /auth` with a random `state`
stored on the server and returns the bank's URL. The redirect comes back to
a frontend route on the app's HTTPS hostname, which posts `code` and `state`
to the signed-in API. The redirect only has to reach the user's browser, so
the app needn't be reachable from the internet, if Enable Banking accepts
the app's hostname as a redirect URL (task 1).

### Credentials

`ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_PRIVATE_KEY` come from the
Secret; with either empty, sync is off. Session IDs are in the database but
useless without the key, and they stay out of backups. A restore clears
connections, so restored links show as needing to reconnect.

### Backup

`BankAccountLink` and `SeenBankLine` join `BACKED_UP_MODELS`, and
`BankConnection` does not. The link's connection reference and bank account
ID are dropped on export. Older backups restore with no links.

## Risks / Trade-offs

- [Revolut's API doesn't expose pockets, so "Revolut Pockets" isn't fed and
  pocket moves don't pair] → The user marks pocket moves as transfers by
  hand, which creates the other side. Spending from a pocket isn't seen.
- [A wrong line lands in the ledger with no preview] → Hard identification
  by reference, a start date, and Review for categories. Nothing is lost:
  every line can be edited or deleted and stays deleted.
- [A bank repeats or changes references] → The fallback handles repeats. A
  reference that changes for one line would add it twice; references stayed
  the same across Crelan's fetches.
- [Payee differs between a hand-entered line and the bank] → Adoption
  misses it and the line appears twice, visibly. Accepted.
- [Auto-link joins two unrelated equal amounts] → Requires a single match
  both ways, shows as "→ account", and unlinks in one click.
- [Restricted mode terms change, or the "Restriction of Use" terms rule out
  this setup] → Task 1 reads them. Sync is optional, and CSV import stays.
- [Bank data passes through a third party] → Accepted for this feature, and
  it only happens once the user connects a bank.

## Migration Plan

Deploying changes nothing until credentials are added and a bank is
connected. Rollback: disconnect the banks and remove the CronJob; synced
transactions stay as normal transactions.


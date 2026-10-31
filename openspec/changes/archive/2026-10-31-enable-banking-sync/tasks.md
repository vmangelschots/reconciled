# Tasks

## 1. Spike on real bank data (needs the user's Enable Banking app and bank login)

- [x] 1.1 Read the "Restriction of Use" terms and register an app. Verify
  that the terms allow this setup and that the app's hostname is accepted
  as a redirect URL, and record both in `design.md`.
- [x] 1.2 With a throwaway script outside the repo, confirm through
  `GET /aspsps` that Crelan and the household's Revolut account are
  available, and link both. Verify by recording each bank's consent length
  in `design.md`.
- [x] 1.3 Dump about 30 days of raw lines twice, some hours apart, and keep
  the output out of the repo. Verify by recording in `design.md`: whether
  pockets appear, which fields hold the date, payee and fees, and whether
  `entry_reference` is present and stable.
- [x] 1.4 Decide whether Revolut gets linked and update `proposal.md` and
  `design.md` through `/opsx:update`. Verify that no Open Question depends
  on the spike any more.

## 2. Enable Banking client and models

- [x] 2.1 Add PyJWT and cryptography, and the `ENABLE_BANKING_*` settings to
  `settings.py` and `.env.example`. Verify the app starts with them unset.
- [x] 2.2 Add the `banksync` app with `BankConnection`, `BankAccountLink`
  and `SeenBankLine`. Verify `python manage.py makemigrations --check`.
- [x] 2.3 Add the client: JWT signing, banks, auth, sessions, paginated
  transactions, typed errors for expired sessions and rate limits. Verify
  with tests on stubbed responses, including `continuation_key`.
- [x] 2.4 Add the line mapping and reference fallback. Verify with tests for
  "An outgoing payment with a counterparty", "No counterparty", the date
  order, debit signs and a missing or repeated `entry_reference`.

## 3. Shared posting

- [x] 3.1 Move creation and counterpart confirmation from
  `ImportSessionViewSet.commit` to `imports/ledger.py`. Verify
  `python manage.py test imports` passes unchanged.
- [x] 3.2 Make `link_pair` reset the category's confirmed, source and reason
  fields. Verify with a test that a linked line leaves the Review count.

## 4. Sync

- [x] 4.1 Implement the per-link sync: window, pending and start date
  filters, seen lines, counterpart confirmation, adoption and creation.
  Verify with tests for every scenario under "New lines go straight into
  the ledger", "A bank line is only added once", "Adopt a line already in
  the ledger" and "Synced lines confirm created transfer counterparts".
- [x] 4.2 Add transfer linking. Verify with tests for every scenario under
  "Link transfers between linked accounts" and "Automatic links leave the
  user's choices alone", including a loan-matched line.
- [x] 4.3 Run categorizing and `sync_loans` after linking. Verify with tests
  for "Categorize after a sync" and a line that became a transfer.
- [x] 4.4 Add failure handling, the advisory lock and `sync_banks`. Verify
  with tests for "One bank is down", "The bank ends consent early", a rate
  limit, "No credentials", an archived account and "Sync pressed during a
  scheduled run".

## 5. Connections API and Settings

- [x] 5.1 Add endpoints to list banks, start and complete authorization,
  link accounts, sync now and disconnect, with `state` checked. Verify with
  tests for the "Connect a bank", "Link a bank account to a ledger account",
  "Reconnect a bank" and "Disconnect a bank" scenarios.
- [x] 5.2 Add the bank connections section to Settings and the redirect
  route: connect, link with the start date, sync now, last sync, errors,
  reconnect, disconnect and the not-set-up state. Verify with component
  tests, `npm run lint` and `npm run build`.

## 6. Overview, backup and deployment

- [x] 6.1 Add reconnect lines and sync times to the Overview's Needs
  attention and stale-import logic and its frontend links. Verify with tests
  for the new and changed `overview` scenarios.
- [x] 6.2 Add links and seen lines to the backup, leaving sessions out.
  Verify with tests for "A deleted line stays deleted after a restore",
  "Reconnect after a restore" and restoring an older backup.
- [x] 6.3 Add the CronJob and example Secret keys, and document setup in
  `k8s/README.md`. Verify with kubeconform and that the example values are
  placeholders.
- [x] 6.4 Update the "no live bank sync" note in `openspec/config.yaml`.
  Verify `openspec validate enable-banking-sync --strict` passes.

## 7. Check it end to end

- [ ] 7.1 On the running app, connect a real bank, link it with a start
  date and sync twice. Verify the lines appear once, a deleted line stays
  deleted, and a categorized guess reaches Review.

## Workflow follow-up

- Archive the change on its branch before the PR is merged.

# Proposal

## Why

Stocks are managed in Portfolio Performance, so an investment account's value
in Reconciled has to be worked out and typed in by hand, and net worth is only
as fresh as the last time that happened. Uploading an export should set the
value in one step, without making Reconciled a portfolio tracker.

## What Changes

- Investment accounts gain "Import portfolio" beside "Set value": the user
  uploads an XML export from Portfolio Performance.
- The system works out the value from the file: each holding's shares at its
  latest price, plus the balances of the cash accounts.
- A preview shows the holdings total, each cash account with a checkbox, the
  dates of the prices, and the new and current value. Nothing is saved until
  the user confirms.
- Saving records the value through the existing value adjustment, dated by the
  newest price.
- The cash accounts the user left out are remembered, so money tracked
  elsewhere in Reconciled isn't counted twice on the next upload.
- A file the system can't read in full is refused with a clear reason, never
  turned into a partial value: an encrypted or binary file, a holding that
  isn't in euro or has no price, an unknown transaction type, or any
  transaction that isn't accounted for.
- The uploaded file is never stored.

Out of scope: storing holdings, trades or prices, showing positions or returns,
fetching prices, other currencies, reading encrypted files, and one account per
portfolio. The single value covers the whole file.

## Capabilities

### New Capabilities
- `portfolio-value-import`: Setting an investment account's value from a
  Portfolio Performance export: reading the file, the preview, leaving out cash
  accounts, and refusing files that can't be read in full.

### Modified Capabilities

None. Saving uses "Set an account's value" in `value-adjustments` as it stands,
and the remembered cash accounts travel in backups as account data.

## Impact

- **Backend**: new parser module in `accounts`, preview and save actions on
  `AccountViewSet`, a new field on `Account` with a migration. `lxml` is already
  a dependency.
- **Frontend**: new import dialog, a header action on `TransactionsPage`, API
  calls in `api/accounts.js`.
- **Data**: no holdings or trades are kept, only the value adjustment and the
  ids of the cash accounts left out.

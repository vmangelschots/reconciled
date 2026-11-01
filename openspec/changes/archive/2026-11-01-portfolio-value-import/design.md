# Design

## Context

Investment accounts already hold a value through `set_value` in
`transactions/adjustments.py`, reached by `POST /api/accounts/{id}/set-value/`.
It validates the account type, replaces an adjustment on the same date and
recomputes later ones, so this change only has to produce a date and a value.

The file format was checked against one real export (format version 70). The method reproduced Portfolio Performance's own
total to the cent. The export is not a public contract, so the parser has to
fail loudly when it meets something it doesn't understand.

What that export showed:

- It is XStream XML with a `client` root: `securities`, `accounts`,
  `portfolios`.
- Repeated objects are `reference` attributes holding relative paths, such as
  `../../../../../securities/security[2]`.
- An account or portfolio is defined where it first appears. That can be inside
  a transaction under another tag: the export had one defined as `accountTo`,
  and portfolios can sit inside `crossEntry`.
- Transactions are defined under several tags (`account-transaction`,
  `accountTransaction`, `portfolio-transaction`, `portfolioTransaction`,
  `transactionFrom`, `transactionTo`).
- Shares and prices are scaled by 10^8, amounts by 10^2.
- A security's newest price may be in `latest`, or only in `prices`. `latest` can
  share a date with the history at a different price, and `latest` is the one
  Portfolio Performance values with.

## Goals / Non-Goals

**Goals:**
- One value from one file, correct to the cent or refused.
- No trace of the file beyond the value and the ids of excluded cash accounts.

**Non-Goals:**
- Parsing anything but cash totals and share counts: taxonomies, dashboards,
  plans and watchlists are ignored.
- Replaying history. The value is as of the file, not of past dates.

## Decisions

### Stateless preview, then an ordinary save

`POST /api/accounts/{id}/portfolio-preview/` (multipart) parses the file in
memory and returns the holdings total, price dates, cash accounts with their
remembered state, the value's date and whether a later value exists. The file
goes no further. `POST /api/accounts/{id}/portfolio-import/` then takes
`{date, value_cents, excluded_cash_ids}`, calls `set_value` and saves the
exclusions in one transaction.

The frontend adds up the ticked cash locally, so ticking needs no round trip.
The save trusts the client's value, which is no weaker than `set-value`.

Alternative: keep the parsed result server-side between the two steps, or
re-upload on save. The first means storing derived data with a lifetime, against
the requirement not to keep anything; the second sends the file twice for nothing.

### Parser in `accounts/portfolio_file.py`, free of Django

A pure function from bytes to a result dataclass, raising `PortfolioFileError`
with a user-facing message. That keeps the rules testable without a database.
It is built on `lxml`, already a dependency, with `resolve_entities=False`,
`no_network=True`, `load_dtd=False` and `huge_tree=False`. A document with a
DOCTYPE is refused outright.

Alternative: `defusedxml`. That adds a dependency for protection these options
and the DOCTYPE refusal already give.

### Find owners by shape, not by tag

The parser walks the whole tree. Any non-reference element with both `uuid` and
`transactions` is an owner, a cash account when it has a `currencyCode` and
otherwise a portfolio. Tags don't work here either, since a portfolio can be
defined as `portfolioTo`. Investment plans also list transactions and are skipped. References are resolved by walking the path, with `..`, `tag` and
`tag[n]` steps. A `reference` in any other form refuses the file.

Tag-based lookup under `accounts` is exactly the bug the first trial script
had: it missed an account defined as `accountTo`.

### The completeness check

Every element with `date`, `type` and `amount` children that isn't a reference
is a transaction definition. The parser counts those and compares them with the
distinct transactions reached through owners, and refuses a mismatch. Each
transaction reached twice also refuses. This catches the next surprise in the
format, not only the one already seen.

### Signs per owner

The same type means different things by owner, so the tables are separate:

- Portfolio: `BUY`, `DELIVERY_INBOUND`, `TRANSFER_IN` add shares; `SELL`,
  `DELIVERY_OUTBOUND`, `TRANSFER_OUT` remove them.
- Cash: `DEPOSIT`, `INTEREST`, `DIVIDENDS`, `FEES_REFUND`, `TAX_REFUND`, `SELL`,
  `TRANSFER_IN` add; `REMOVAL`, `INTEREST_CHARGE`, `FEES`, `TAXES`, `BUY`,
  `TRANSFER_OUT` subtract.

Only some of these appear in the checked export. The rest come from the format
as remembered, so each gets a test in the made-up sample, and any other type
refuses the file. All arithmetic uses `Decimal`, rounding half up per holding.

### Value date

The newest price date among the holdings, because that is the moment the value
describes. Today when there are no holdings, and capped at today. Dating by
upload would put an old file's value on the wrong day.

### Remembered exclusions on the account

`Account.portfolio_excluded_cash`, a `JSONField` list defaulting to empty, holds
Portfolio Performance's cash account uuids. Uuids survive a rename and hold no
names. A plain field with a default needs no backup converter: `backup/format.py`
loads older backups with the default.

The save replaces the list with what the user just left out. An excluded account
missing from one file is forgotten, which is acceptable.

Alternative: a separate settings model. That's a table for one list.

### The account comes from the page

The import starts from the investment account's ledger, so no mapping between a
file and an account is stored. Reconciled has no need to remember "which account",
which the brainstorm had assumed.

### Reuse the Dialog

`PortfolioImportDialog.jsx` follows `SetValueDialog`: file input, then the
preview in the same dialog, with refusals shown inline so the user can pick
another file.

## Risks / Trade-offs

- [The format changes in a later Portfolio Performance version] → Unknown types,
  unknown references and the completeness check refuse the file; a refusal is
  annoying but never a wrong number. Versions below 70 are refused because
  they are unchecked.
- [Types not seen in the real export are misread] → They are tested on the
  made-up sample only. Compare the total with Portfolio Performance on the first
  real file that has dividends or fees.
- [A retired portfolio or cash account still counts] → Nothing in the checked
  export was retired, so this is an assumption. Cash shows in the preview and
  can be unticked; retired holdings would show up as a difference from
  Portfolio Performance.
- [Trades dated after the newest price still count] → The value covers the whole
  file. Rare and small, and it matches what is in the file.
- [The exported XML is an unencrypted copy of the trade history] → Nothing is
  stored here; the dialog reminds the user to delete the export. `/my.xml` is
  gitignored, and tests use a made-up sample only.

## Migration Plan

One additive migration on `accounts`. Rollback leaves the adjustments in place,
since they are ordinary value adjustments.

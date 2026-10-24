# Proposal

Issue: #11

## Why

The household tracks two joint accounts (Revolut and Crelan), but the
app treats them one at a time:
- the overview shows a single chosen account;
- Transactions hides the other account behind a dropdown;
- balances only appear together on the Accounts page.

So the accounts feel disconnected, and "how are we doing?" only gets
half an answer. On top of that, the overview's forecast tile is built on
recurring transactions the user never enters by hand, so it would always
be empty. The forecast is being rethought separately.

## What Changes

- **The overview covers every active account:**
  - **Balance tile:** the total balance and the month's change across
    all accounts.
  - **Accounts tile** (new): one row per account with its balance and
    how long ago it was last imported (in the warning colour after 7
    days, "No imports yet" for a new one). Each row opens that account's
    transactions.
  - **Recent transactions:** all accounts, with the account name under
    the amount when there is more than one account. A transfer between
    two of the user's accounts shows once, as "Revolut → Crelan €500".
    "View all" opens the last-opened account.
  - **Needs attention:** at most one stale-import line, naming the
    account (or how many accounts) not imported for over a week.
  - **Removed:** the account picker, the remembered overview account,
    and the forecast tile. The Accounts tile takes the forecast tile's
    place.
  - **Budget tile:** loses its "All accounts" note, since the whole page
    is now household-wide.
- **Accounts in the navigation:**
  - The desktop sidebar always lists the active accounts under
    Transactions, indented, each with its balance. Only the open account
    is highlighted. With one account there are no sub-items; beyond five,
    the rest go behind "+N more", which links to Accounts.
  - The sidebar footer shows the total ("Total · 2 accounts").
  - Below 1024px, Transactions shows scrollable account pills under its
    title, with the selected account's balance.
- **Each account has its own ledger address,** `/transactions/<id>`.
  - Plain `/transactions` (the tab bar, "View all") opens the
    last-opened account, or the first active one.
  - The account dropdown on Transactions goes away.
  - An archived account's address still opens, marked "Archived" and
    without the add form.
  - An unknown account goes back to `/transactions` with a notice.
- **Import starts on the right account:**
  - `?account=<id>` preselects it, which the stale-import line and an
    empty ledger's "Import" button use;
  - otherwise Import starts on the last-opened account.
- **The overview endpoint** answers for a month across all active
  accounts, with a per-account list (balance, last import) instead of a
  single account.

Not in scope:
- The Forecast page (it keeps its own account dropdown) and anything
  about recurring payments.
- A combined ledger of all accounts.
- Changes to the Accounts page.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `overview`: covers all active accounts, with a total balance, an
  Accounts tile, recent transactions from every account, and one
  stale-import line. The account picker and the forecast tile are
  removed, and the endpoint no longer takes an account.
- `ui-shell`: the sidebar lists accounts under Transactions and shows
  the total; account pills on narrow screens; the page header no longer
  carries an account picker on the overview.
- `transactions`: each account's ledger has its own address and opens
  the last-opened account by default; archived and unknown accounts are
  handled.
- `transaction-import`: the target account can be preselected through
  the address and defaults to the last-opened account.

## Impact

- **Backend:** `OverviewView` in `reports/views.py` drops `account`, sums
  balances, lists accounts with their last import date, and returns
  recent rows across accounts with internal transfers collapsed. The
  forecast part goes. `reports/tests_overview.py` is updated.
- **Frontend:**
  - `OverviewAccountContext` becomes an accounts context holding the
    active accounts and the last-opened account id.
  - `Layout` gets the sidebar account rows and the total.
  - `App` routes `transactions/:accountId`.
  - `TransactionsPage` reads the account from the address and gets pills
    below 1024px.
  - `OverviewPage` gets the Accounts tile and recent rows across accounts.
  - `ImportPage` reads `?account=`.
- No new dependencies.

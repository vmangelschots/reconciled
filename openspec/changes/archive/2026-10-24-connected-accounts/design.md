# Design

## Context

- `OverviewView` (`reports/views.py`) takes `month` and `account`. It
  returns one account's balance and last import, its month in/out
  (`active_transactions()` filtered to the account, which already leaves
  out transfers and tabs), the household-wide budget and attention, a
  forecast and 8 recent `ledger_rows()` of the account.
- `OverviewAccountContext` loads the active accounts on every route
  change and remembers the overview's account under
  `reconciled.overviewAccount`. The sidebar footer and the overview read
  it.
- `TransactionsPage` keeps `accountId` in state, defaults to
  `accounts[0]` from its own `listAccounts()`, and shows a `Select` in
  its `PageHeader`. Routes are `/transactions` only.
- `ImportPage` defaults its account `Select` to `accts[0]`.
- `AccountViewSet` lists only non-archived accounts. Retrieving one by id
  isn't filtered.
- Tab bar and More sheet active matching use `NavLink` and
  `pathname.startsWith`, so `/transactions/5` already marks Transactions.

## Goals / Non-Goals

**Goals:**
- One accounts context feeds the sidebar, the pills, the overview and
  Import, so they never disagree.
- Account addresses (`/transactions/:id`) make links, back and refresh
  work.

**Non-Goals:**
- The Forecast page and its endpoint stay as they are.
- No combined ledger and no server-stored "last account".

## Decisions

### Overview endpoint: month only

`GET /api/reports/overview/?month=YYYY-MM`. Any `account` parameter is
ignored. The response keeps the old shape where it can:

- **`accounts`:** `[{id, name, balance_cents, last_import_date | null}]`
  for the active accounts, in name order.
  - `last_import_date` comes from one grouped query: the latest
    committed `ImportSession.updated_at` per account.
  - Balances use `current_balance_cents` per account (a handful of
    accounts).
- **`balance_cents`:** the sum of those balances.
- **`in_out`:** `active_transactions()` for the month, with no account
  filter.
- **`budget`, `attention`:** unchanged.
- **`recent`:**
  - Selection: `ledger_rows()` of active accounts, newest first. Inflow
    legs whose transfer counterpart sits in an active account are
    excluded, so each internal transfer appears once, by its outgoing
    leg. The first 8 are kept.
  - Each row: `{id, date, payee, amount_cents, account_name,
    category_label, is_tab, transfer_account_name, part_count}`.
- **`forecast`:** dropped, along with the `generate_forecast` import.

Alternative considered: grouping transfer pairs in the frontend. That
would need both legs inside the same eight rows. Excluding in the query
is simpler and always fills eight.

### One accounts context, with the last-opened account

`OverviewAccountContext` becomes `AccountsContext`
(`src/accounts/AccountsContext.jsx`) with:
- `accounts`: active accounts, reloaded on route change as now;
- `loaded`;
- `total`: the sum of the active balances;
- `lastOpenedId`: in `localStorage` under `reconciled.lastAccount`,
  wrapped in try/catch;
- `setLastOpened(id)`;
- `defaultAccount`: the last-opened one if it is still active, else the
  first.

The old `reconciled.overviewAccount` key is no longer read.

### Routes

- `transactions` → `TransactionsIndex`, which waits for `loaded`, then
  does `<Navigate replace to={/transactions/<defaultAccount.id>}>`. With
  no accounts, it shows the existing "Add an account first" state.
- `transactions/:accountId` → `TransactionsPage`:
  - It reads `useParams()`.
  - It fetches the account with `getAccount(id)` (new, `GET
    /api/accounts/:id/`), which also returns archived accounts. On a 404
    it toasts "That account wasn't found." and navigates to
    `/transactions` with `replace`.
  - For an active account it calls `setLastOpened(id)`.
  - For an archived account it shows an "Archived" badge in the header
    and hides the add-transaction panel.
  - Transfer targets keep coming from the active list, minus this
    account.

### Sidebar

- With more than one active account, the Transactions link in the
  sidebar becomes a group:
  - the parent `NavLink` to `/transactions` gets the filled style only
    on its exact path (it immediately redirects anyway); on a child path
    it shows `text-ink-primary` with an accent icon;
  - one child `NavLink` per account (first five), indented `pl-10`, with
    a 1px left rule, `truncate` name with `title`, and the balance via
    `formatMoneyWhole` in `text-xs num text-ink-muted`
    (`text-on-accent/80` when active);
  - "+N more" links to `/accounts`.
- Footer: `TOTAL · N accounts` (caps label) over the total in
  `text-base font-semibold num`. This replaces `AccountReadout`.

### Pills

- `AccountPills` sits in `TransactionsPage` as its own row under
  `PageHeader`, `lg:hidden`, and only with more than one active
  account.
  - Container: `-mx-4 flex gap-2 overflow-x-auto px-4`.
  - Pill: a `NavLink`, `h-8 rounded-full px-3 text-sm whitespace-nowrap`.
    Active is `bg-accent text-on-accent`, the rest `bg-surface-2
    text-ink-secondary`.
  - The active pill is scrolled into view on mount.
  - The balance of the open account sits at the end of the row.
- The page header's account `Select` is removed.

### Overview page

- No account picker. The header keeps the month switcher and Import.
- The tiles are Balance (total and month change), Budget (without the
  "All accounts" note) and Accounts.
  - **Accounts tile:** a `Panel` with `ListRow`s: name, `secondary` =
    import freshness (`text-warning` when stale), `end` = whole-euro
    balance, `to` = `/transactions/:id`.
- Freshness is computed in the browser with `daysSince`:
  - "imported today" / "imported N days ago" / "No imports yet";
  - stale means more than 7 days, or never.
- **Stale import line:**
  - the stale accounts are taken from the same list;
  - one is named ("Crelan: last import N days ago"), several are counted
    ("2 accounts not imported this week");
  - the link is `/import?account=<stalest>`, where never-imported counts
    as the stalest.
- **Recent rows:**
  - With more than one account, `end` stacks the `Amount` over a muted,
    truncated account name.
  - A transfer row's primary text is "<account_name> → <transfer_account_name>",
    with the amount shown unsigned, without the positive colour.
  - "View all" links to `/transactions`.
- `api/overview.js` drops the account argument.

### Import

`ImportPage` reads `?account=` with `useSearchParams`. It keeps that
account when it is in the active list, else takes `defaultAccount` from
the context. The `Select` stays.

## Risks / Trade-offs

- [The total silently drops an archived account that still holds money.]
  → The Accounts page already moves archived accounts out of every list,
  and "Total · N accounts" names the count. Warning before archiving a
  non-zero account is left for a later change.
- [A remembered last-opened id points at an archived account.] →
  `defaultAccount` ignores ids not in the active list. Archived ledgers
  open only through a direct address.
- [Five sidebar rows plus balances crowd a short screen.] → The cap of
  five, with "+N more", keeps the sidebar within a laptop height.
  Households with many accounts are rare in a single-household app.
- [Tests depend on the dropdown and on `OverviewAccountContext`.] →
  They are rewritten in the same tasks, so each task leaves the suite
  green.

## Migration Plan

Frontend and backend ship together, with no data migration. The old
`reconciled.overviewAccount` browser entry is simply ignored. To roll
back, revert the merge.

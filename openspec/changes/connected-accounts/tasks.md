# Tasks

## 1. Overview endpoint across accounts

- [x] 1.1 Change `OverviewView` to take only `month`:
  - return `accounts` (active, in name order, with balance and `last_import_date` from one grouped query) and `balance_cents`;
  - compute `in_out` across active accounts;
  - return `recent` across active accounts, with internal transfers listed once by their outgoing leg and `account_name` on each row;
  - drop `forecast`.

  Rewrite `reports/tests_overview.py` for:
  - the total and per-account balances;
  - "A transfer between accounts changes nothing";
  - "Archived accounts are left out";
  - `last_import_date` per account, including null;
  - "A transfer shows once", which still fills 8 rows;
  - "Last eight" across accounts;
  - "Malformed month", and a missing month;
  - the unchanged budget and attention cases.

  Verify that the backend suite passes.

## 2. Accounts context, routes and navigation

- [x] 2.1 Replace `OverviewAccountContext` with `AccountsContext`:
  - accounts, `loaded` and `total`;
  - `lastOpenedId` in `reconciled.lastAccount` (wrapped in try/catch) and `setLastOpened`;
  - `defaultAccount`, falling back to the first active account.

  Add `getAccount(id)` to `api/accounts.js`. Verify with `AccountsContext.test.jsx`: the default is the last-opened account; it falls back when that account is missing or archived; the total sums active balances.
- [x] 2.2 Rewrite the sidebar in `Layout`:
  - Transactions gets account children (the first five plus "+N more"), with only the open account marked;
  - no children with one account;
  - the footer shows "Total · N accounts".

  Verify with `Layout.test.jsx` cases for "Two accounts in the sidebar", "The open account is marked", "One account", "Many accounts" and "Wide viewport shows navigation inline" (the footer total), with the existing tab bar and review count cases still passing.

## 3. Ledger per account

- [x] 3.1 Route `transactions` to a redirecting index and `transactions/:accountId` to `TransactionsPage`:
  - read the account from the address and load it with `getAccount`;
  - set it as last opened when active;
  - for an archived account, show "Archived" and hide the add form;
  - for an unknown one, toast and redirect;
  - remove the account `Select`;
  - add `AccountPills` below 1024px, with the open account's balance;
  - give an empty ledger an Import link to `/import?account=<id>`.

  Update `TransactionsPage.test.jsx` and `TransactionsPage.splits.test.jsx` to render at `/transactions/1`, and add cases for:
  - "Open an account directly";
  - "Back to the last account";
  - "Nothing opened yet";
  - "An archived account";
  - "An unknown account";
  - "Switch account on a phone" (pills);
  - "A new account" (the Import link).
- [x] 3.2 Make `ImportPage` preselect `?account=` when it is active, else the context's `defaultAccount`. Verify with `ImportPage.test.jsx` cases for "From a stale-import reminder" and "From the navigation".

## 4. Overview across accounts

- [ ] 4.1 Update `OverviewPage`:
  - remove the account picker and the forecast tile, and drop the account argument from `api/overview.js`;
  - Balance shows the total;
  - add the Accounts tile, with freshness in the warning colour after 7 days or never, and rows linking to `/transactions/:id`;
  - make the stale-import line one item (named or counted, linking to `/import?account=<stalest>`);
  - recent rows show the account name under the amount when there are 2+ accounts, and transfer rows read "<from> → <to>" unsigned;
  - "View all" links to `/transactions`;
  - remove the Budget tile's "All accounts" note;
  - in the grid, Accounts takes the forecast tile's slot.

  Rewrite `OverviewPage.test.jsx` for:
  - "Opens on this month for all accounts" and "No accounts yet";
  - both Balance tile scenarios;
  - "Two accounts", "A new account" and "Open an account";
  - "Everything that needs attention", "Nothing to do", and the three stale-import scenarios;
  - "Last eight" and "A transfer shows once";
  - the unchanged budget, chart, tabs and loading cases.
- [ ] 4.2 Check in the local stack, with two seeded accounts and a transfer between them:
  - the sidebar accounts and total, at desktop width;
  - the pills, at 390px and 800px;
  - the overview's total, Accounts tile, stale line and single transfer row;
  - the stale line opening Import on the right account;
  - an archived account's address and an unknown one.

  Verify that frontend `npm test`, `npm run lint` and `npm run build` pass, and that backend `python manage.py test` passes.

## Workflow follow-up

- Open a GitHub issue for this change on the Reconciled project and reference it in proposal.md.
- Archive the change on its branch, then open the PR with `Fixes #N`.

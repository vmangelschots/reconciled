# Design

## Context

- Categories are two levels deep (`Category.parent`).
- Reports already leave transfers out: `reports._active_transactions()`
  filters `transfer_counterpart__isnull=True` on `counted_rows()`.
- `BudgetSummaryView` loops over every category.
- Split parts are ordinary transactions with their own category, so a tab
  row can be a whole transaction or a part with no extra work.
- `CategoryCombobox` already shows transfer targets as a separate cmdk
  group after the ranked categories.
- The ledger's category filter is exact-match, kept in component state,
  and scoped to one account. That is why the tab page is its own view
  instead of a filtered ledger (see the UI and UX review in the
  exploration).

## Goals / Non-Goals

**Goals:**
- Tabs are a kind of category, so splits, inline editing, history
  guesses and unsplit-to-final-category work unchanged.
- One place decides "is this row in a tab", and every report uses it.

**Non-Goals:**
- No new account type, and no app-created counterpart rows.
- No matching of repayments to the items they repay; balances are sums.
- No change to the ledger's filter or URL state.

## Decisions

### Tabs are categories, not accounts
A tab as an account would reuse transfers, but it needs hiding from four
account pickers, creates counterpart rows, and needs its own "write off"
feature. As a category, a tab entry is just the joint account's row, and
writing off is recategorizing. What's lost is a tab entry with no
joint-account line, which the user doesn't need: they only track the
joint account.

### `is_tab_group` on top-level categories only
- A boolean `Category.is_tab_group`, default false, accepted only when
  `parent` is null.
- A category is a tab when `parent.is_tab_group`. That way re-parenting
  is the only way in or out of a tab, and nothing has to cascade.
- The serializer exposes `is_tab_group` (writable) and a read-only
  `is_tab`, plus a read-only `transaction_count` (an annotated count)
  so the settings can decide when to confirm a kind change.
- Alternative: a flag on each category. The reviews preferred the group,
  because the picker label explains itself ("Tabs / Jan") and a stray
  flag on the wrong category can't happen.

### One filter for tab rows
- `TransactionQuerySet.in_tabs()` and `outside_tabs()` filter on
  `category__parent__is_tab_group`. A tab group itself never has rows,
  so the subcategory check is enough.
- `_active_transactions()` adds `outside_tabs()`.
- `BudgetSummaryView` skips categories that are tabs or tab groups.
- `set_limit` returns 400 for them.
- The uncategorized sums need no change, because tab rows have a
  category.

### A tab group is never a transaction's category
One helper, `budgets.tabs.check_assignable(category)`, raises a
validation error for a tab group. It is called from:
- `TransactionSerializer.validate_category`;
- `SplitLineSerializer`;
- the unsplit `keep` serializer;
- `confirm_categories`.

Switching a group to a tab group is refused while
`category.transactions.exists()`, with the count in the message. That
mirrors the delete-category message.

### Balances and rows computed in Python, in `transactions/tabs.py`
- `tab_rows(category)` returns `counted_rows().filter(category=...)`
  ordered by `(date, id)`, with `split_parent` selected.
- `summarize(rows)` walks the rows once and returns the balance, the
  running balance per row and `open_since`:
  - the running balance is the negated running sum;
  - `open_since` is the first row after the last zero, or null when the
    balance is zero.
- `balances()` runs one query over `in_tabs()` and groups the rows by
  category.
- Archived accounts still count, because a debt doesn't go away when an
  account is archived.

A household has at most a few hundred tab rows, so no SQL window
functions are needed.

### API
- `GET /api/tabs/` returns one entry per tab:
  `{id, name, group_name, balance_cents, open_since, row_count}`.
  The list is sorted by balance size, largest first.
- `GET /api/tabs/{id}/` returns the same fields plus
  `rows: [{id, date, payee, notes, amount_cents, running_balance_cents,
  split_parent, parent_amount_cents}]`. It returns 404 for a category
  that isn't a tab.
- Settling outside the account uses the existing
  `PATCH /api/transactions/{id}/ {category}`, which already works on
  parts.

### Frontend
- `lib/tabs.js`:
  - `tabSentence(name, cents)` returns `{text, tone}`, where tone is
    `"default" | "warning" | "muted"`;
  - `isStale(openSince)` is true after 30 days;
  - `assignableCategories(categories)` drops tab groups.

  Every transaction picker (ledger cell, form, filter, split editor,
  Review page, settle action) passes its categories through
  `assignableCategories`. The parent picker in category settings
  doesn't, so "Tabs" can be chosen as a parent when adding "Piet".
- `CategoryCombobox`:
  - categories with `is_tab` are taken out of the ranked list and shown
    in one group per tab group, after the categories and before the
    transfers;
  - matching and highlighting follow the rules for transfer targets: the
    first tab is highlighted when no category matches;
  - the lucide `HandCoins` icon goes on tab items, on the trigger and in
    the ledger cell.
- `DashboardPage` puts an `OpenTabsCard` first. It renders nothing when
  `/api/tabs/` is empty. Settled tabs sit behind a local toggle. Rows are
  links to `/tabs/:id`. On a phone each row stacks the name and amount
  over the sentence and age.
- `TabPage` at `/tabs/:id`:
  - a header with a back link and the sentence;
  - rows grouped into stretches ending at each zero balance, with a
    "Settled" divider after each;
  - every stretch before the last divider is collapsed behind "Show
    earlier";
  - each lent row gets a "Settled outside the account…" button that opens
    a `CategoryCombobox`. Choosing a category PATCHes the row and reloads.
- `BudgetsPage`:
  - `CategoryForm` gets a "Budget | Tab" segmented control when the
    parent is top-level, and read-only "Tab" or "Budget" text otherwise;
  - an inline confirmation appears when the kind changes and the group's
    subcategories' `transaction_count` sum is above zero;
  - in the tree, tabs show `HandCoins` and their sentence from
    `/api/tabs/`;
  - the summary table needs no change, because the backend leaves tabs
    out.
- The in vs out card gets a muted footnote, "Excludes transfers and
  tabs".

## Risks / Trade-offs

- [The employer tab never clears when the user forgets to split a
  salary.] → "open since" turns amber after 30 days, which the dashboard
  card shows. A salary prompt is out of scope.
- [Writing off a part that Jan paid in cash moves the whole amount to
  "Restaurants", which overstates spending in a past month.] → This is
  accepted for now, and the action's name says what it does. Partial
  cash payments go through the split editor.
- [Turning a group into a tab group changes past months' reports.] → The
  settings confirm first, and say so.
- [History could guess a tab for a payee the user once sent to a tab as
  a whole, e.g. a restaurant.] → The guess is unconfirmed and shows on
  the Review page, like any other guess. Parts never feed history.

## Migration Plan

One additive migration (`is_tab_group`, default false). Existing
categories stay budget categories, so nothing changes until the user
makes a tab group. To roll back, revert the code and run the reverse
migration; tab rows simply become normal categories again.

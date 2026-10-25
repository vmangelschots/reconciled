# Design

## Context

`Account.account_type` is stored but nothing reads it. Balances are
`starting_balance_cents` plus the account's ledger rows
(`Transaction.objects.ledger_rows()`). The reports decide what counts as
income or spending in a few shared places:

- `reports/spending.py:active_transactions()` - overview month change,
  dashboard in/out and category spending
- `budgets/summary.py:uncategorized_spent()` - the budget's uncategorized
  spend
- `transactions/categorize.py:uncategorized()` / `needs_review()` - the
  Review page, its counts and the categorization backfill
- `imports/utils.py:flag_duplicates()` - import duplicate detection
- `transactions/transfers.py` - finding a transfer's matching row

Category budgets (`budget_rows`, `yearly`) only count categorized rows,
so a row that never has a category is already outside them. The
frontend gets accounts once through `AccountsContext`, which feeds the
sidebar, the pills, the pickers and the sidebar total.

The UI and UX reviews of the first draft shaped several decisions below:
the everyday headline, stored values, "still owed" input, the stale-import
exclusion, ordering by tier, and the adjustment row's look.

## Goals / Non-Goals

**Goals:**
- One place that says which tier a type belongs to.
- Adjustments are excluded by a single marker on the row, so each report
  needs one extra filter rather than a new rule.
- A value the user set on a date stays true, whatever is added or
  removed before it.

**Non-Goals:**
- A separate valuation/price model. Adjustments are ordinary rows in the
  ledger.
- Editing an adjustment in place. Setting a value on the same date
  replaces it.

## Decisions

### Tier is derived from the type, not stored
`Account.tier` is a property backed by a module-level mapping
`TYPE_TIERS = {checking: everyday, cash: everyday, credit_card: everyday,
other: everyday, savings: savings, investment: investments, property:
property, loan: loans}` plus `TIER_ORDER`. The serializer exposes `tier`.
The tier then can't disagree with the type, and a type change needs no
migration of tier data. Alternative: a `tier` column or a per-account
"liquid" toggle. Rejected because the exploration settled on the type as
the single setting.

### Ordering by tier happens in the API
The account list endpoint orders by a `Case` over `account_type` that
yields the tier's position, then by name. Every frontend list reads from
`AccountsContext`, so the sidebar, pills, pickers and Accounts page
follow without their own sorting. The overview response uses the same
ordering for its Accounts tile.

### Adjustments are transactions holding their set value
`Transaction` gets `is_adjustment` (bool, default False) and
`adjustment_value_cents` (nullable bigint). An adjustment has
`payee="Value adjustment"`, no category, no transfer, no split and
`category_confirmed=True`. Because it's a ledger row, balances, the
ledger and the forecast's starting balance pick it up unchanged.

Alternatives:
- A separate `Valuation` model. Rejected: every balance computation and
  the ledger would need to merge two sources.
- Store only the difference (the first draft). Rejected after review:
  back-dating or deleting silently moved later values the user had set.

### Recomputing adjustments
`recompute_adjustments(account)` walks the account's adjustments in date
order. For each, it sets `amount_cents = adjustment_value_cents - (balance
at end of its date without it)`. The balance includes earlier
adjustments, which were already recomputed. It writes with
`QuerySet.update()` so it triggers nothing itself. It runs from
`post_save`/`post_delete` signals on `Transaction` (any row in an account
that has adjustments) and `post_save` on `Account` (starting balance).
Signals catch every single-row write path: API edits, transfer
counterparts and splits. Import commit creates its rows with
`bulk_create`, which sends no signals, so it calls `recompute_if_valued`
for each account it imported into. The work is a handful of rows per account, since only
valued accounts have adjustments.

Rows dated on the same day as an adjustment count as before it ("the
balance at the end of that date"), so a deposit on the valuation day
doesn't move the value.

### Setting a value is one endpoint
`POST /api/accounts/{id}/set-value/` with `{date, value_cents}`, where
the value is signed (the frontend negates "still owed" for loans). It:
- replaces any adjustment on that date
- creates the new one
- runs `recompute_adjustments`
- returns the adjustment and the new balance

It returns 400 for an account whose type isn't investment, property or
loan, or for an archived account. A 0.00 difference still records an
adjustment, because it pins the value for later recomputation.

### Adjustments are read-only apart from delete
The transaction API rejects (400) any update to an adjustment: category,
amount, date, transfer target or split. DELETE works and triggers the
recompute. Changing the account's type keeps its adjustments and their
recomputation. Only `set-value` checks the type.

### Overview response
The overview response gains:
- `tiers: [{tier, balance_cents}]` for the tiers that have active
  accounts, in `TIER_ORDER`
- `everyday_cents` for the headline
- per account, `tier` and `last_value_date` (the latest adjustment's
  date)

`balance_cents` stays the overall total (net worth). The frontend:
- With one tier (only `everyday`), the tile is unchanged.
- Otherwise the `Stat` is titled "Everyday", with `everyday_cents` and
  the month change. Below a `border-t` divider sits a compact list (`text-sm`
  rows, label in `text-ink-secondary`, right-aligned `num` amount) of
  each non-everyday tier, then "Net worth" in `font-medium`. Negative
  amounts use the normal ink with a minus sign.
- `freshness()` and `staleImportItem()` skip investment, property and
  loan accounts. Their Accounts tile line reads "value set <d Mon>" or
  "No value set", muted.

Tier labels live in one map in `frontend/src/api/accounts.js`, next to
`ACCOUNT_TYPES`, which gains each type's tier for the grouped select.

### Sidebar total
`AccountsContext` gains `everyday` (total and count) next to `total`.
`TotalReadout` shows "Everyday · N accounts" when the accounts span more
than one tier, and "Total · N accounts" otherwise.

### Ledger: adjustment row and Set value dialog
- **Adjustment row:**
  - payee cell: a lucide `Scale` icon, "Value adjustment" in
    `text-ink-secondary`, and "Set to €310,000" from
    `adjustment_value_cents`
  - category cell: a muted "—"
  - amount in neutral `text-ink-secondary`, not the positive colour
  - the Edit button hidden but its space kept, so Delete lines up
- **Set value:** an outline `size="sm"` button in the ledger
  `PageHeader` actions on investment, property and loan accounts. It
  opens a `Dialog` like `BudgetEditor`'s, with:
  - the current balance
  - a date field (default today)
  - a value field, which is "Still owed" for loans (positive)
  - a live "Adjustment: +€15,000.00" line computed from the current
    balance while the date is today. Once the date is changed it reads
    "Difference worked out on save".
- For loans the dialog adds a one-line note: "Book the monthly payment
  as an expense; update what's owed here." This avoids double-counting
  the principal by also marking the payment as a transfer.
- **Accounts form:** for type Loan, the starting balance field is
  labelled "Still owed" and negated on save. When editing, it shows the
  stored value negated.

## Risks / Trade-offs

- [A missed query point counts adjustments as income] → each listed
  call site gets a test with an adjustment present. The value-adjustments
  spec scenarios cover the overview, the dashboard, the budget and the
  Review page.
- [Signals make writes harder to follow] → one signal module in
  `transactions`, guarded to accounts that have adjustments, with tests
  for each spec scenario under "A set value holds on its date".
- [An import before a valuation date silently changes an adjustment's
  amount] → that is the intended behaviour (the set value holds). The
  ledger shows "Set to" so the reason is visible.
- [A loan's starting balance entered as negative by habit] → the field
  says "Still owed", so a negative entry is rejected for loans with "Enter
  what you still owe as a positive amount".

## Migration Plan

Two migrations: the new `AccountType` choices (no data change) and the
two `Transaction` fields (`is_adjustment` default False,
`adjustment_value_cents` null). Both are backwards compatible. Rollback
is to reverse the migrations, which deletes no rows, though any
adjustments would then count as normal uncategorized transactions until
deleted.

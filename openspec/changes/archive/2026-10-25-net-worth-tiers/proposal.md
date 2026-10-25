# Proposal

Issue: #24

## Why

The Overview's Balance tile and the sidebar total add every active
account into one figure, so spendable money and total worth are mixed
together. Liquidity is a spectrum, though: a checking account is
spendable today, savings within days, investments with some effort, and
a house not at all. Investments, a house and a mortgage also change
value without any bank transaction, so the app currently has no way to
hold them at their real value.

## What Changes

- **New account types.** Next to checking, savings, credit card, cash and
  other, accounts can be `investment`, `property` or `loan`. A loan holds
  what is still owed as a negative balance. The user enters it as a
  positive "still owed" amount.
- **Tiers come from the type.** Each account falls into one of five
  tiers, from most to least liquid:
  - Everyday: checking, cash, credit card, other
  - Savings
  - Investments
  - Property
  - Loans

  There is no separate setting. The type choice is grouped by tier, with
  "Other (everyday)". Accounts are listed by tier and then name
  everywhere, so a house never pushes an everyday account out of the
  sidebar.
- **Everyday money stays the headline.** When accounts span more than
  one tier:
  - The Overview's Balance tile is titled "Everyday" and shows the
    everyday total. Under a divider it lists the other tiers and "Net
    worth".
  - The sidebar total shows the everyday total.
  - Loans are shown with a minus sign, not in alarm red.

  With only everyday accounts, nothing changes.
- **Value adjustments.** On an investment, property or loan account, the
  user can set the account's value on a date from a "Set value" dialog
  in its ledger. This records a "Value adjustment" that holds the value
  set:
  - Its amount is the difference from the balance on that date. It is
    recomputed when earlier entries change, so back-dating or deleting
    never moves a later value the user set.
  - Setting a value twice on the same day replaces the earlier
    adjustment.
  - In the ledger it reads "Value adjustment · Set to €310,000" in a
    neutral colour. It has no category, edit, split or transfer
    control, but it can be deleted.
  - It is never income, spending or uncategorized, so it is never
    counted in budgets, the dashboard, the Overview's month change or
    recent list, or the Review page.
- **Valued accounts aren't nagged about imports.** Investment, property
  and loan accounts show "value set 1 Oct" in the Overview's Accounts
  tile and never trigger the stale-import reminder.
- **Mortgage for now.** The monthly payment from checking stays a normal
  expense in a category of the user's choosing. The loan balance is
  updated by hand with Set value. Automating that is #25.

Not in scope:
- Mortgage amortization schedules and automatic principal adjustments
  (#25).
- Market prices, holdings or quantities for investments: only the
  account's value.
- Net worth history or charts over time.
- Grouping accounts under tier headings on the Accounts page, in the
  sidebar or in the Overview's Accounts tile. Ordering by tier is in
  scope.
- Changing how budgets, the dashboard or the forecast count normal
  transactions. A categorized expense counts whatever the account's tier.

## Capabilities

### New Capabilities
- `value-adjustments`: setting an investment, property or loan account's
  value on a date, keeping each set value when earlier entries change,
  entering loans as what is owed, the adjustment's ledger row, and that
  it never counts as income or spending.

### Modified Capabilities
- `accounts`:
  - the new `investment`, `property` and `loan` types and their tiers
  - the type choice grouped by tier
  - a loan's starting balance entered as what is owed
  - accounts listed by tier
- `overview`:
  - the Balance tile shows everyday money with the other tiers and net
    worth beneath it
  - debt isn't shown as an alarm
  - valued accounts show "value set" and skip the stale-import reminder
  - recent transactions and the month change leave out adjustments
- `ui-shell`: the sidebar total shows the everyday total when accounts
  span more than one tier.
- `dashboard`: money in and money out leave out value adjustments.
- `budgets`: uncategorized spend leaves out value adjustments.

## Impact

- Backend:
  - `accounts`:
    - new `AccountType` choices (migration) and a type-to-tier mapping
    - the account list ordered by tier then name
  - `transactions`:
    - adjustment fields on `Transaction` (migration)
    - a set-value endpoint
    - recomputing adjustments when earlier entries in the account change
    - exclusions in `uncategorized()`, `needs_review()`,
      auto-categorization, duplicate detection and transfer marking
  - `reports` / `budgets`:
    - `active_transactions()` and `uncategorized_spent()` skip
      adjustments
    - the overview response adds per-tier totals and each account's
      last value date
- Frontend:
  - account types grouped by tier, and a "still owed" input for loans
  - the Overview `BalanceTile`, `AccountsTile` and stale-import item
  - the sidebar `TotalReadout`
  - in the ledger, the adjustment row and a "Set value" dialog
- No new dependencies.

# Proposal

## Why

This is a greenfield project with no existing functionality. We need a first
usable slice of the personal budget app: a place to hold financial accounts,
get transactions into the system from bank exports, categorize them against
monthly spending limits, and see where money is headed. Without this
foundation there is nothing to build forecasting, reporting, or any later
feature on top of.

## What Changes

- Introduce financial accounts (checking, savings, credit card, cash) with a
  starting balance and a running balance derived from transactions.
- Introduce a transaction ledger: manually add, edit, delete, and categorize
  transactions against an account.
- Introduce CSV and OFX file import: upload a bank export, map its columns
  to transaction fields (for CSV), preview the parsed transactions, detect
  and skip likely duplicates against existing transactions, and commit the
  rest to the ledger.
- Introduce budget categories with a monthly spending limit per category,
  and a per-period view of amount spent vs. limit for each category.
- Introduce cash-flow forecasting: define recurring transactions (bills,
  income) with a frequency and amount, and project account balances forward
  in time using current balances plus scheduled recurring items.

## Capabilities

### New Capabilities
- `accounts`: Create, edit, and view financial accounts and their balances.
- `transactions`: Maintain the transaction ledger for an account - manual
  create/edit/delete, categorization, and listing/filtering.
- `transaction-import`: Upload CSV/OFX bank export files, map columns,
  preview parsed results, detect duplicates, and commit transactions into
  the ledger.
- `budgets`: Define spending categories with a monthly limit and track
  actual spend against that limit per period.
- `forecasting`: Define recurring transactions (bills/income) and project
  future account balances from them.

### Modified Capabilities
(none - greenfield project)

## Impact

- New Python backend (new service, data model, and API) and new React
  frontend (new app, no existing UI to change).
- New persistent storage for accounts, transactions, categories, budgets,
  and recurring-transaction definitions.
- No existing code, APIs, or systems are affected.

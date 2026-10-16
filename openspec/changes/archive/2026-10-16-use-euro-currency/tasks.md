# Tasks

## 1. Shared money formatting

- [x] 1.1 Add `frontend/src/lib/money.js` with `formatMoney(cents)` (euro, browser locale, 2 decimals) and `formatMoneyCompact(cents)` (euro, compact notation, at most 1 decimal), with a single `CURRENCY = "EUR"` constant. Verify with `money.test.js`: whole, negative and fractional amounts; compact output for 1,500.00 and 42.00; no "$" anywhere.
- [x] 1.2 Replace the local formatters in the 5 pages and 3 chart components with the shared helper, and update the tests that assert "$" amounts. Verify that `grep -rn 'USD\|\$\${' frontend/src` finds nothing, and that the full frontend suite and lint pass.

## 2. Integration check

- [x] 2.1 Rebuild the local frontend and check in the browser that the ledger, accounts, budgets, forecast and dashboard (axis, tooltip, table) all show euro amounts.

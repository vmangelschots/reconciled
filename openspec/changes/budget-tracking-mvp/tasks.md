# Tasks

## 1. Project scaffolding & single-user auth

- [x] 1.1 Scaffold the Django project and a `core` app (settings configured for Postgres, Django REST Framework installed) and verify `manage.py migrate` runs cleanly against a fresh database
- [x] 1.2 Add a `db` Postgres service and a `backend` service to `docker-compose.yml` with a `Dockerfile` for the backend, and verify `docker compose up db backend` starts both and a `/health` endpoint on the backend returns 200
- [x] 1.3 Scaffold the React frontend with a basic layout/routing shell, add its `Dockerfile` and a `frontend` service to `docker-compose.yml`, and verify `docker compose up` serves the placeholder app at the frontend's published port
- [x] 1.4 Configure Django's built-in auth (a single `User`, created via a bootstrap management command) and a login endpoint using DRF session authentication, protecting all non-login API routes, and verify tests: an unauthenticated request to a protected route returns 401, and a correct login followed by a request using the returned session cookie succeeds

## 2. Accounts

- [ ] 2.1 Add the `accounts` model (name, type, starting_balance_cents, archived) via a Django migration, and verify the migration applies and reverses cleanly
- [ ] 2.2 Implement create/list/get/edit account endpoints, with list/get returning a computed current balance (starting balance + sum of transactions), and verify tests for: creating an account, rejecting a missing name, and an account with no transactions showing a balance equal to its starting balance
- [ ] 2.3 Implement the starting-balance-immutability rule (editable only with zero transactions) and the archive endpoint (hides from default list, keeps history), and verify tests for both `accounts` spec scenarios: editing starting balance before vs. after a transaction exists, and an archived account disappearing from the default list while its past transactions remain readable
- [ ] 2.4 Build the frontend accounts list page and create/edit account form, and verify manually that creating an account in the UI shows it in the list with the correct balance

## 3. Transactions

- [ ] 3.1 Add the `transactions` model (account FK, date, amount_cents, payee, category FK nullable, notes) via a Django migration, and verify the migration applies with the account/category foreign keys enforced
- [ ] 3.2 Implement create/edit/delete transaction endpoints, and verify tests for the `transactions` spec scenarios: adding an expense decreases the account balance by the correct amount, a zero/missing amount is rejected, editing an amount updates the balance, and deleting a transaction restores the balance
- [ ] 3.3 Implement category assignment on transactions (including leaving one uncategorized) and the list/filter endpoint (date range, category, text search over payee/notes), and verify tests for: an uncategorized transaction not counting toward any category, and a combined date-range + category filter returning only matching transactions
- [ ] 3.4 Build the frontend transaction ledger view for an account (list, add/edit/delete, category picker, filters), and verify manually that adding a transaction through the UI updates the displayed account balance

## 4. Budgets

- [ ] 4.1 Add the `categories` and `category_limits` models (category_limits keyed by category + month, supporting a default plus per-month overrides) via a Django migration, and verify the migration applies with a unique constraint on category name
- [ ] 4.2 Implement category create/rename endpoints and the delete-requires-reassignment rule, and verify tests for the `budgets` spec scenarios: duplicate category name rejected, deleting a category with assigned transactions blocked, and deletion succeeding after those transactions are reassigned
- [ ] 4.3 Implement setting a default monthly limit and a specific-month override, and the monthly summary endpoint (spent, remaining, over-limit flag per category, plus total uncategorized spend for the month), and verify tests for the `budgets` spec scenarios: default vs. overridden month limit resolution, a category within its limit, a category over its limit, and uncategorized spend reported separately from every category total
- [ ] 4.4 Build the frontend categories management page and the monthly budget summary view, and verify manually that the summary for a seeded month matches the spent/remaining/over-limit figures computed by the API

## 5. Transaction import (CSV/OFX)

- [ ] 5.1 Add the `import_sessions` model (target account, raw parsed candidates, duplicate flags, status) via a Django migration, and implement the file upload endpoint that detects CSV vs. OFX and rejects any other format, and verify tests for accepting a `.csv`/`.ofx` upload and rejecting an unsupported file type
- [ ] 5.2 Implement CSV column mapping (date/amount/description required, payee/debit-credit optional) and parsing, and verify tests for the `transaction-import` spec scenarios: a valid mapping parsing every row, and proceeding being blocked when date or amount is left unmapped
- [ ] 5.3 Implement OFX parsing via `ofxparse` with no manual mapping required, and verify a test that a well-formed OFX upload parses its transactions automatically
- [ ] 5.4 Implement the duplicate-detection heuristic (exact date + exact amount + description fuzzy-match ratio ≥ 0.8 against existing transactions on the target account) and the preview endpoint that returns candidates with duplicate flags without writing any transactions, and verify tests for: a re-imported transaction being flagged as a likely duplicate, and zero transactions existing in the database after a preview-only call
- [ ] 5.5 Implement the commit endpoint that creates transactions only for user-confirmed candidates in one DB transaction and marks the session committed, and verify a test matching the spec's example: confirming 18 of 20 candidates (2 duplicates excluded, one re-included duplicate override) creates exactly the confirmed transactions and the account balance reflects them
- [ ] 5.6 Build the frontend import flow (file upload, account selection, CSV column-mapping form, preview table with per-row include/exclude and duplicate flags, confirm step), and verify manually that importing a sample CSV end-to-end creates the expected transactions

## 6. Forecasting

- [ ] 6.1 Add the `recurring_transactions` model (account FK, amount_cents, payee, category FK nullable, frequency, start_date, end_date nullable) via a Django migration, and implement create/edit/delete endpoints, and verify tests for the `forecasting` spec scenarios: defining a monthly recurring bill, an edited amount applying to future occurrences only, and a deleted recurring definition producing no further occurrences while past ledger transactions are untouched
- [ ] 6.2 Implement on-demand forecast generation (expand each active recurring transaction's schedule within a requested horizon, merge in date order with the account's current balance, stop occurrences past any end date), and verify a test matching the spec's example: a 2000.00 balance with a single -1500.00 monthly bill due in 10 days projects an unchanged balance through day 9, a drop to 500.00 on the due date, and 500.00 through day 30
- [ ] 6.3 Verify a test for the spec's multi-recurring scenario: combining multiple recurring transactions in a forecast applies every in-horizon occurrence in date order and reflects their cumulative effect, and a test confirming that recording an actual transaction does not remove or alter a recurring definition's projected future occurrences
- [ ] 6.4 Build the frontend recurring-transactions management page and a forecast view (horizon selector, projected balance over time), and verify manually that the forecast for a seeded account and recurring bill matches the numeric example from 6.2

## 7. End-to-end integration

- [ ] 7.1 Wire `manage.py migrate` to run automatically on backend container startup, and verify that `docker compose up` against a completely fresh `db` volume results in a running stack with an up-to-date schema
- [ ] 7.2 Verify an end-to-end smoke test against the running compose stack covering the full v1 flow: log in, create an account, import a sample CSV, confirm the resulting transactions and balance, categorize transactions and set a budget limit, view the monthly budget summary, add a recurring transaction, and view its forecast - all without errors

## Workflow follow-up

- Archive this change (`/opsx:archive` or `openspec archive budget-tracking-mvp`) once the tasks above are complete and reviewed.
- After archiving, confirm the main specs under `openspec/specs/` read correctly as the standalone description of the system as built.

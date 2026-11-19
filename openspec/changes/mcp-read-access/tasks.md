# Tasks

## 1. Access tokens (backend)

- [x] 1.1 Create the `mcpserver` Django app (add it to `INSTALLED_APPS`, not to `backup.format.DATA_APPS`) with an `AccessToken` model: user, household, name, `token_hash` (unique), `prefix`, `created_at`, `last_used_at`, `revoked_at`. It's a plain model like `households.Invite`, not `HouseholdScoped`, because it's looked up before a household is bound. Add the migration. Verify with `python manage.py makemigrations --check` and the migration test run.
- [x] 1.2 Add token creation (`rcn_` + 32 random URL-safe bytes, SHA-256 hash stored, prefix kept for display) and a lookup that accepts a token only when it isn't revoked, its user is active and the user is a member of its household. Unit tests cover each refusal: unknown, revoked, inactive user, left household, and rejoined household (works again).
- [x] 1.3 Add session-authenticated endpoints under `/api/mcp-tokens/`: list the caller's tokens for the active household; create (name required, returns the full token once; the endpoint URL is built by the frontend from its API base, since Django has no forwarded-proto setting and would say `http://` behind the TLS ingress); revoke (DELETE). API tests check another member's tokens and other households' tokens are invisible and can't be revoked (404), an empty name is rejected, and the full token appears only in the create response.
- [x] 1.4 Add a test that a valid token sent as `Authorization: Bearer` to `/api/transactions/` and `/api/auth/me/` is refused with 401 and no session. Add a test that a downloaded backup has no tokens or hashes, and that tokens still work after a restore (access-tokens, "Tokens aren't in backups").

## 2. MCP transport (backend)

- [x] 2.1 Add the `/mcp` view per design D1: CSRF-exempt `POST` with one JSON-RPC message; `initialize` (version negotiation from one supported-versions constant, server name and app version, `tools` capability), `ping`, `tools/list` and `tools/call`; notifications get 202; unknown methods get -32601; malformed JSON gets a JSON-RPC parse error; `GET` gets 405. Route it in `config/urls.py`. Tests cover each method and error, and both negotiation cases.
- [x] 2.2 Add bearer authentication to the view: missing, unknown or revoked tokens get 401 with `WWW-Authenticate: Bearer`, a session cookie alone isn't accepted, and an `Origin` from another site gets 403. Requests with no Origin or the app's own origin are allowed. A valid token runs the call inside `household_context(token.household)` and updates `last_used_at` at most once a minute. Tests cover each case, including that `last_used_at` doesn't change on a second call within the minute.
- [x] 2.3 Add the tool registry: name, description, JSON Schema input, `readOnlyHint: true` annotation and handler. Validate arguments against the schema before the handler runs, and return `isError` results with a short message for invalid arguments, unknown ids and service errors. Run `sync_loans(today)` before each call (design D4). Add shared formatters for amounts (`"-42.50 EUR"`), dates and `YYYY-MM` months, with a default of the current month. Tests cover the formatters, schema rejection (e.g. month "2026-13") with no handler call, the unknown-tool error, and that `tools/list` marks every tool read-only.

## 3. Reference tools

- [x] 3.1 `list_accounts` (optional `include_archived`) and `list_categories` (tree with parent, budget kind and tab/tab-group flags). Tests check balances match the Accounts API, archived accounts appear only when asked for, and subcategories sit under their parent.
- [x] 3.2 `search_transactions`: date range, account ids, category id including subcategories, uncategorized only, case-insensitive payee or notes text, and amount range. Newest first, page size 50 by default and 200 at most, opaque `next_cursor` and `total`; each result is marked when split or a transfer. Tests cover each filter, paging over 320 rows with no cursor on the last page, and a bad cursor returning an error.
- [x] 3.3 `get_transaction` with split parts, transfer counterpart account and category confirmed/guessed. Tests cover a split transaction, and an id from another household answering "not found" exactly like an id that never existed.

## 4. Budget and report tools

- [ ] 4.1 `get_budget(month?)` from `budget_rows`/`budget_totals` (with pace for the current month) and the yearly rows. Tests check per-category figures and totals match `/api/budgets/summary/` for the same month, including a parent covering its subcategories and a Bills category.
- [ ] 4.2 Move the overview's assembly out of `OverviewView.get` into a `reports` service function that the view calls (design D4). Verify the existing `reports/tests_overview.py` passes unchanged.
- [ ] 4.3 `get_overview(month?)` on that function. A test checks its figures match `/api/reports/overview/` for the same month.
- [ ] 4.4 `get_spending_report(start, end)` on `spending_report`, with the same 24-month cap and range errors as the API. Tests cover a normal range matching `/api/reports/spending/` and a too-long range error.
- [ ] 4.5 `get_forecast(days?)` (90 by default) on `everyday_forecast`: daily projected balances and coming-up items with their late state. A test checks it matches `/api/forecast/` for the same horizon.
- [ ] 4.6 `get_year_plan(year?)` on `year_view` for the Current plan only: year totals, actual spending, income lines and where the year is heading, with drafts left out. A test checks it matches the Current plan API and that an existing draft doesn't appear.
- [ ] 4.7 `get_net_worth_history(months?)` (12 by default) on `month_end_balances`, total and per tier. Tests cover the default, and less history than asked for.
- [ ] 4.8 `list_loans` (account, principal, rate, installment, balance owed, next and last installment dates) and `list_tabs` (worded balance such as "owes you 30.00 EUR", open since). Tests check both against the loan schedule and tab APIs.
- [ ] 4.9 Add an isolation test with two households, each with its own token, calling every registered tool. It asserts no row from the other household appears in any result, and it fails when a new tool isn't covered.

## 5. Settings: MCP access (frontend)

- [ ] 5.1 Add API helpers in `frontend/src/api/mcpTokens.js` (list, create, revoke) with tests in the style of `client.test.js`.
- [ ] 5.2 Add `McpAccessSection` to `SettingsPage`, styled like the other Settings panels: the data warning, a name field and Create, a one-time display of the full token with Copy and "won't be shown again", the endpoint URL and client config snippet with Copy (token included right after creation, placeholder otherwise), and a list with name, prefix, created and last used ("Never used"), plus Revoke with confirmation. Component tests cover create, an empty name, copy, the snippet with and without the token, and revoke. Verify `npm test` and `npm run lint` pass.

## 6. Deployment and end-to-end check

- [ ] 6.1 Route `/mcp` to the backend in `k8s/50-ingress.yaml`, and note the endpoint in `k8s/README.md`. Verify with the CI kubeconform command (`-strict -summary`).
- [ ] 6.2 In the running app (run-reconciled skill), create a token in Settings and connect a real MCP client (e.g. `claude mcp add --transport http reconciled <url>/mcp --header "Authorization: Bearer <token>"`). List the tools, and check `get_budget`, `search_transactions` and `get_overview` against the Budgets, Transactions and Overview pages. Revoke the token and confirm the client is refused. Also run backend `python manage.py test`, and frontend `npm test`, `npm run lint` and `npm run build`.

## Workflow follow-up

- Work on branch `change/mcp-read-access`; commit the planning artifacts as `Propose mcp-read-access: read-only MCP endpoint with personal access tokens`.
- Archive the change on its branch before the PR is merged; the PR references #79 for the transport decision.

# Proposal

Issue: #79 (transport decision to revisit)

## Why

Questions like "am I on track this month?", "what did we spend on groceries
since summer?" or "which bills are coming up?" mean clicking through several
pages today. An AI assistant could answer them in a sentence if it could read
the household's data. The Model Context Protocol (MCP) is the common way to
give assistants such as Claude Code, Claude Desktop and Cursor that access.
A first, read-only version gives that value without any risk of an assistant
changing the budget.

## What Changes

- A new MCP endpoint at `/mcp` that MCP clients connect to over HTTP. It only
  offers read tools: nothing an assistant does through it can change data.
- Read tools for what the app already shows:
  - accounts and their balances
  - categories (tree, budget kind, limits)
  - a month's budget and its progress (limit, spent, left, pace), the same
    figures as the Budgets page
  - transactions: search by date range, account, category, payee text and
    amount, paged, and one transaction with its splits
  - the month overview, the spending report, the forecast and upcoming
    bills, the year plan against actuals, net worth history, loans and tabs
- Personal access tokens, which a user creates in Settings for one of their
  households, sees once, and can revoke. An MCP client sends the token as a
  bearer token. A token reads only its household, only while its user is a
  member, and can't be used on the app's regular API.
- Settings shows the endpoint URL and a config snippet to copy into a client.

Out of scope for this version:

- Write tools (adding or categorizing transactions, changing budgets).
- OAuth and claude.ai / mobile custom connectors, which need an OAuth 2.1
  authorization server. See the transport issue linked from design.md.
- Streaming responses (SSE) and server-to-client requests.
- Import sessions, bank-sync state, invites and backups through MCP.

## Capabilities

### New Capabilities
- `access-tokens`: personal access tokens. Creating, listing and revoking
  them, binding each to one user and one household, and when a token stops
  working.
- `mcp-server`: the read-only MCP endpoint. Which tools exist, what each
  returns, how amounts and pages are presented, and how it is authenticated.

### Modified Capabilities
<!-- None: existing pages and APIs behave as before. -->

## Impact

- Backend: a new Django app for tokens and the MCP view, a token model and
  migration, and a bearer-token authentication path used only by `/mcp`. The
  tools call the existing service modules (`budgets/summary.py`, `reports/*`,
  `forecasting/forecast.py`, and so on) instead of computing figures again.
- Frontend: a token section in Settings (create, copy once, list, revoke).
- Deployment: `/mcp` routed to the backend by the ingress. No new container
  or dependency.
- Security: a token gives read access to a household's financial data, and
  assistants pass what they read on to their model provider. The create flow
  says so.

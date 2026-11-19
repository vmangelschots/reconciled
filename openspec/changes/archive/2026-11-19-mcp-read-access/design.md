# Design

## Context

- The API is Django REST Framework with session auth only
  (`core.authentication.SessionAuthentication401` plus CSRF). Every request
  needs a household, which `HasHousehold` binds per request into a
  contextvar (`households/context.py`). A scoped query with no household
  bound raises an error instead of reading every household.
- The figures the UI shows come from service modules, not from views:
  `budgets/summary.py` (`budget_rows`, `budget_totals`, "shared by the Budgets
  page and the overview so the two can't disagree"), `reports/spending.py`,
  `reports/balances.py`, `forecasting/forecast.py`, `budgets/plans.py`,
  `transactions/tabs.py` and `transactions/loans.py`.
- The backend runs as sync WSGI on gunicorn with a 30s worker timeout,
  behind an nginx ingress that routes `/api`, `/admin` and `/static` to the
  backend and everything else to the frontend.
- MCP's Streamable HTTP transport allows a stateless server: the client
  POSTs JSON-RPC to one URL, and the server may answer with a plain JSON
  body instead of opening an SSE stream.

## Goals / Non-Goals

**Goals:**
- Read tools that return the same numbers as the matching page, by calling
  the same functions.
- No new container, process or runtime dependency. The feature ships in the
  existing backend image.
- A token can only ever read one household, and the scoping mechanism the
  app already has enforces this.

**Non-Goals:**
- Supporting every optional part of MCP. Resources, prompts, sampling,
  elicitation, subscriptions and SSE streams are left out.
- A general API-token system for `/api/`. Tokens here exist for `/mcp` only.

## Decisions

### D1. Serve MCP from a plain Django view, not the official `mcp` SDK

**Status:** accepted. Revisit triggers are tracked in issue #79.

**Context.** The official Python SDK (`mcp`, including FastMCP) is built
on ASGI/Starlette and anyio. The backend is sync WSGI. Read-only tools need
none of the transport features that make the SDK worth its weight:
streaming, server-to-client requests, or sessions.

**Decision.** A Django view at `/mcp` implements the stateless subset of
Streamable HTTP:

- `POST /mcp` takes one JSON-RPC message and answers with
  `application/json`. It handles `initialize`, `ping`, `tools/list` and
  `tools/call`. Notifications (e.g. `notifications/initialized`) get
  `202 Accepted` with no body. Unknown methods get JSON-RPC
  `-32601 Method not found`.
- `GET /mcp` returns `405`, because no SSE stream is offered. No
  `Mcp-Session-Id` is issued, so each request stands alone.
- Version negotiation: the server answers `initialize` with the client's
  requested protocol version when it supports that version, and otherwise
  with the newest version it supports. The supported versions are one
  constant.
- Tool errors are returned the way MCP expects (`isError: true` with a
  readable message), so the assistant can correct itself. Protocol errors
  use JSON-RPC error codes.
- The view is CSRF-exempt (bearer auth, no cookies) and checks the `Origin`
  header when one is sent, as the transport spec asks, to block DNS
  rebinding.
- Each tool is a plain function with a name, a description and a JSON
  Schema for its input, kept in a registry. The view validates the
  arguments against that schema before it calls the tool.

**Alternatives considered.**
1. *FastMCP mounted next to Django under uvicorn/ASGI workers.* Nicer
   schema generation from type hints, and protocol upkeep handled upstream.
   But it changes how the whole backend is served, for one endpoint.
2. *A separate MCP container that uses the SDK and imports Django.*
   Leaves the main backend alone, but adds a deployment, an ingress route
   and an image to self-hosters' setups.

**Consequences.**
- We keep the protocol subset current ourselves. The subset is small:
  four methods, one version constant and an error shape.
- Long-running tools are capped by gunicorn's 30s timeout. All the planned
  tools are database reads in the same range as page loads.
- Switching later is cheap: the tool registry and functions don't depend
  on the transport, so only the view would be replaced. Issue #79 lists
  when to revisit.

### D2. Personal access tokens, bound to one user and one household

**Context.** MCP clients like Claude Code and Claude Desktop send a
configured `Authorization` header. They can't hold a session cookie or a
CSRF token. OAuth is out of scope for this version (see proposal).

**Decision.**
- A token row holds: user, household, name, a hash of the secret, the
  first characters of the token for display, created, last used and
  revoked. The secret is `rcn_` followed by 32 random bytes, URL-safe
  encoded. It is shown once on creation. Only a SHA-256 hash is stored,
  which is enough for a high-entropy random secret, and is the same
  approach invite links use.
- A bearer authentication class, used only by the `/mcp` view, looks up the
  hash. It refuses the request (`401` with `WWW-Authenticate: Bearer`)
  unless the token exists, isn't revoked, its user is active, and the user
  is still a member of the token's household. It then runs the request
  inside `household_context(token.household)`. These checks run on every
  request, so leaving a household or being deactivated cuts access at once.
- `/api/` keeps its default authentication classes, which don't include
  the bearer class, so a token is never accepted there.
- `last_used_at` is updated at most once a minute per token, so it doesn't
  cost a write on every call.
- Tokens are managed through session-authenticated `/api/` endpoints. A user
  sees and revokes only their own tokens, in the active household.

**Alternatives considered.**
1. *DRF's `authtoken`.* One token per user, stored in plain text, with no
   household binding, no name and no revocation history.
2. *OAuth 2.1 authorization server.* Needed for claude.ai connectors, but
   several times the work. It's a later change that can sit next to these
   tokens.
3. *Tokens that follow the user's active household.* Rejected: a household
   switch in the browser would silently change what an assistant reads.

**Consequences.** Someone in two households who wants an assistant to read
both creates two tokens and two client entries. That is explicit and
matches "one household at a time".

### D3. Tools wrap the existing service modules

**Decision.** Each tool calls the service function behind the matching page
(`budget_rows`/`budget_totals` for the budget, the overview, spending and
forecast functions, and so on). It then converts the result into a compact
shape for a model to read:

- Amounts are decimal strings with the currency code (`"-42.50 EUR"`), not
  cents, because models misread minor units.
- Lists that can grow, like transaction search, are capped per page and
  return an opaque `next_cursor`.
- Dates are ISO 8601, and months are `YYYY-MM`.

Tools never call DRF views or serializers. Those are shaped for the
frontend and tied to the request and session.

**Alternatives considered.** *Calling the REST endpoints internally.* It
reuses the serializers, but drags session and CSRF assumptions in, and
returns frontend-shaped payloads that are noisy for a model.

**Consequences.** When a page's calculation changes, the tool's numbers
follow automatically. A tool's output shape is its own contract, specified
in `specs/mcp-server`, separate from the REST API's.

### D4. Tools run the same catch-up as page loads, and the overview moves into a service

**Context.** Read pages aren't pure reads today. The overview, budget,
plan, report and transactions views call `transactions.loans.sync_loans(today)`
first, which books installments that have fallen due. The overview's
figures are also put together inside `OverviewView`
(`reports/views.py`), not in a service module.

**Decision.**
- The MCP view calls `sync_loans(today)` once per `tools/call`, before the
  tool runs. It's idempotent bookkeeping the app does on every page load,
  not a change the household made. So "read-only" in the spec means no tool
  changes what the household entered or set up.
- The overview's assembly moves from `OverviewView.get` into a function in
  `reports/` (for example `overview(month, today)`). The view and the tool
  both call that function. This is a pure refactor, and the existing
  overview tests guard it.
- The other tools use the functions that already exist: `budget_rows` /
  `budget_totals` and `budgets/yearly.py`, `spending_report`,
  `everyday_forecast`, `year_view`, `month_end_balances`,
  `transactions.tabs.balances`, and the loan schedule.

**Alternatives considered.** *Skip the catch-up in tools.* Purer, but a tool
would show balances without an installment that the next page load books,
so the assistant and the app would disagree.

**Consequences.** A tool call can write installment rows, exactly as opening
the app does. The tool annotations still say `readOnlyHint: true`, because
from the client's point of view nothing it asked for is changed.

## Risks / Trade-offs

- [A leaked token exposes a household's finances] → The token is shown once
  and stored as a hash, has a recognisable `rcn_` prefix for secret
  scanners, is read-only, can be revoked, and shows when it was last used.
- [Data read through MCP leaves the instance for the assistant's model
  provider] → The create-token flow says so plainly. The user decides which
  client gets a token.
- [Hand-rolled protocol drifts behind MCP revisions] → The subset is small
  and version negotiation is explicit. Issue #79 tracks when to switch to
  the SDK.
- [A broad transaction search pulls large result sets into the model's
  context] → Page size is capped and pages use a cursor.
- [Forgetting to bind the household in a tool] → Tools only run inside the
  view's `household_context`. Scoped queries raise when nothing is bound,
  and isolation tests cover tokens from two households.

## Migration Plan

Additive: one new table and migration, a new route, and a new ingress path
(`/mcp` → backend in `k8s/50-ingress.yaml`). Rolling back means removing the
route. The table can stay.

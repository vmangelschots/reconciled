# Proposal

## Why

Deleting a transaction (and the same pattern on every list page) feels
broken: nothing visibly happens while the request is in flight, then the
whole table vanishes behind a bare "Loading..." line and reappears a
moment later. Tracing the code confirms why: `AccountsPage` and
`TransactionsPage` both gate their table on a `loading` flag that's set
`true` on *every* reload, including the one triggered by a delete/edit -
so an already-populated table unmounts down to one line of text and back
up again, which collapses and re-expands the page's height and is what
reads as "the page jumps." Separately, no per-row action button (Delete,
Archive, Rename, Save, Set limit, etc. - across every page) gives any
visual feedback while its own request is running, so there's a real gap
between click and visible result with nothing in between.

## What Changes

- A list that already has data stays visible during a background reload
  (after any add/edit/delete/filter change) - the "Loading..." state
  only ever appears on a page's very first load, when there's nothing to
  show yet. No more unmount/remount, no more height collapse, no more
  scroll jump.
- Every per-row action button (Delete, Archive, Rename, Edit-save, Set
  limit, and the equivalent on Budgets/Forecasting) disables itself the
  instant it's clicked, for the duration of that specific action - so a
  click always has an immediate, visible effect, not just an eventual
  one.
- Deleting a transaction, and archiving an account, remove the affected
  row from the already-loaded list directly instead of re-fetching the
  whole list afterward - the outcome is already fully known from the
  delete/archive call itself, so the extra network round trip was pure
  waiting with nothing left to discover. Every other mutation (create,
  edit, rename, set limit, recurring changes) keeps reloading, since
  those depend on server-computed results (balances, recalculated
  summaries) a client can't know in advance.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `ui-shell`: adds a requirement for stable, responsive in-place list
  updates - the cross-cutting UI behavior this change is actually about,
  alongside the existing theme/nav/toast requirements it already owns.

## Impact

- Frontend only: `AccountsPage.jsx`, `TransactionsPage.jsx`,
  `BudgetsPage.jsx`, `ForecastingPage.jsx` - the list-rendering and
  per-row-action logic on each. No backend or API changes; no new
  dependencies.

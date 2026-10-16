# Design

## Context

`AccountsPage` and `TransactionsPage` both follow the same pattern:
`reload()` calls `setLoading(true)` synchronously, then
`{loading ? <p>Loading...</p> : <Table>...}` swaps the whole table for
one line of text until the fetch resolves. Every mutation handler
(`handleDelete`, `handleArchive`, `handleSave`, etc.) calls `await
mutate(); toast.success(...); await reload();` - so a click triggers two
sequential network round trips (the mutation, then a full re-fetch)
before anything visible changes, and the second one always collapses
and re-expands the page. `BudgetsPage` and `ForecastingPage` don't have
the collapsing-table bug (their lists aren't gated on a loading flag),
but their row actions have the same first half of the problem: no
pending-state feedback at all between click and the eventual reload's
result. See `proposal.md` - Why.

## Goals / Non-Goals

**Goals:**
- Eliminate the unmount/remount that collapses page height and causes
  the scroll jump, on every page that has it.
- Every per-row action gives immediate feedback (a disabled control) the
  instant it's clicked, on every page.
- Where a mutation's outcome is already fully known (delete, archive),
  stop paying for a redundant re-fetch.

**Non-Goals:**
- Not a general optimistic-UI overhaul. Create/edit/rename/set-limit/
  recurring-transaction changes keep reloading from the server - they
  depend on server-computed results (a recalculated balance, a
  recalculated budget summary row) a client can't correctly predict, and
  guessing wrong would be worse than a brief, now-unobtrusive wait.
- No change to toast timing or content - `ui-shell`'s existing feedback
  requirement is unaffected; this is purely about the list/button state
  around it.
- No change to any API, model, or backend behavior - frontend-only.

## Decisions

### "Loaded once" gates the loading placeholder, not every reload
Each affected page tracks whether it has ever successfully loaded data
(a ref or boolean state set once, not reset by subsequent reloads).
Render logic becomes: show the loading placeholder only when nothing has
loaded yet; once there's data, keep rendering the table through every
later reload, regardless of a request being in flight. This is the
direct fix for the collapse/jump - the table element is never removed
from the tree once mounted with real content.

### Per-row pending state via a small id set, not a global flag
Each page adds a `pendingIds` set (`useState(new Set())`) distinct from
any form's own `submitting` flag. A row action adds its id before
calling the mutation and removes it in a `finally`, disabling that row's
relevant button(s) via `disabled={pendingIds.has(id)}` while present.
Scoped per-id rather than one global "busy" flag, so clicking Delete on
one row doesn't disable Edit on every other row - only the row actually
being acted on visibly responds.

### Delete/archive update local state directly; everything else still reloads
`deleteTransaction`/`archiveAccount`'s outcome is fully known the moment
the request succeeds - the item is gone, or no longer in the default
list. `setTransactions((prev) => prev.filter((t) => t.id !== id))` (and
the equivalent for archived accounts) removes it from state directly, no
second request. Every other mutation keeps its existing `await
reload()` - the `[Goals/Non-Goals]` boundary above; they still benefit
from the first decision (no more collapse) even though they still wait
on a real reload.

### Applied uniformly across all four pages
Per `ui-shell`'s own charter ("cross-cutting... every page shares"), the
pending-state-on-click fix (decision 2) lands on `BudgetsPage` and
`ForecastingPage` too, not just the two pages with the collapse bug -
same shape of fix, mechanically repeated, not new design per page.

## Risks / Trade-offs

- [Tracking "loaded once" per page is a small amount of repeated
  boilerplate across four pages rather than one shared hook] →
  Acceptable at this scale (four pages); a shared `useReloadable()`-style
  hook is a reasonable future extraction if a fifth page needs the same
  shape, not worth abstracting for four.
- [Skipping the reload for delete/archive means local state and server
  state could in principle drift if a request partially fails in an
  unusual way] → Mitigated the same way every other mutation already is
  here: the request is awaited and any error throws before the local
  state update runs, so a failed delete/archive never removes the row
  locally - this mirrors the existing error-handling shape, not a new
  risk introduced by this change.

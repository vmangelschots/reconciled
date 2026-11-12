# Design

## Context

The shell's shared data lives in three providers set up by `Layout`:

- `AccountsContext` holds the active accounts, total and everyday total. The
  sidebar, account pills, Overview, Reports, Import and Loan pages use it.
- `ReviewCountContext` holds the Review pill's count.
- `BankSyncContext` holds the sync status and a `version` that goes up when a
  sync ends.

The first two reload when `refreshKey` (`pathname#bankSyncVersion`) changes,
plus when a page calls their `refresh()` by hand. Pages do this unevenly:
`TransactionsPage` refreshes accounts after some actions and not others, and
`ImportPage` refreshes the Review count but not the accounts. Many saves
(budgets, categories, account settings, transfers, splits) refresh neither.
`BankSyncContext` fetches its status only on route change, and polls only
while it already knows a sync is running.

Every API call goes through `apiFetch` or `apiUpload` in `src/api/client.js`.
The one exception is the backup download/restore in `api/backup.js`, and a
restore reloads the whole app anyway.

## Goals / Non-Goals

**Goals:**
- One place decides that data changed, so a new page or a new save can't
  forget to refresh the shell.
- Reloads never show older data than the last save, even when responses come
  back out of order.

**Non-Goals:**
- Telling each page which records changed. Pages keep reloading their own
  data as they do today.
- Exact "did this request change anything" knowledge. A non-read request that
  only previews (for example, CSV column mapping) also triggers a reload.
  That costs two small GETs and is harmless.

## Decisions

### Announce changes from the API client, not from pages
`apiFetch` and `apiUpload` call `notifyDataChanged()` after any successful
response to a non-safe method (POST/PUT/PATCH/DELETE). This happens after the
response is read and before it is returned, so a page that awaits the save
and then reloads its own data sees the same server state the shell does.
Failed requests (non-2xx, network errors) don't notify.

*Alternatives:* keep per-page `refresh()` calls and add the missing ones.
That fixes today's gaps, but every new feature has to remember it, and
forgetting it is this bug. Another option is a data-fetching library
(React Query/SWR) with cache invalidation. That is a large migration across
every page for a problem two contexts have, so it isn't worth it here.

### A tiny in-module event bus
`src/lib/dataChanged.js` exports `notifyDataChanged()` and
`onDataChanged(listener) → unsubscribe`, backed by a `Set` of listeners. It
is a plain module rather than a React context, because `client.js` isn't a
component. It isn't a `window` CustomEvent either, which keeps it testable
and scoped to this app.

### Coalesced reload: one in flight, at most one queued
A shared hook, `useCoalescedRefresh(load, apply)` in `src/lib/`, wraps each
provider's load. When asked to reload while
a load is in flight, it marks itself dirty instead of starting another. When
the in-flight load ends, it starts one more if dirty. Only the newest
response is applied. This gives the spec's "one more reload, not one per
save" and the ordering guarantee. It also absorbs the case where a route
change and a save notify at the same moment.

*Alternative:* a time debounce (for example 150 ms). It still lets an older
response overwrite a newer one, and it adds lag to every save.

### Tab visibility triggers the same reload
Each of the three providers listens for `visibilitychange` and reloads when
`document.visibilityState === "visible"`. For `BankSyncContext` that means
reloading the status. If a sync turns out to be running, its existing
polling runs until the sync ends and bumps `version`, which then reloads
accounts and the Review count through `refreshKey`. One small hook,
`useOnVisible(callback)`, keeps that in one place.

*Alternative:* a periodic poll while the tab is in front. It's out of scope
(see proposal). Visibility covers the "came back to it" case at no constant
cost.

### Remove manual refresh calls
The `refreshAccounts()` / `refreshReviewCount()` calls after saves in
`TransactionsPage`, `ImportPage`, `ReviewPage`, `LoanSchedulePage`,
`SpendingSheet` and `BudgetSheet` become redundant and are removed, along
with their now-unused hook destructurings. `refresh` stays on both contexts
as a public escape hatch.

### Errors stay silent
Like today, a failed background reload keeps the current values and shows no
toast. `loaded` is set after the first attempt only, so a later failure
doesn't flash an empty sidebar.

## Risks / Trade-offs

- [More GETs than before: two after every save] → Both endpoints are small,
  and coalescing caps it at one extra round per burst. Acceptable for a
  household-scale app.
- [A request that changes data but isn't a mutation method] → None exist:
  every write goes through POST/PUT/PATCH/DELETE. The client test pins the
  rule (GET doesn't notify, each unsafe method does).
- [Removing a manual refresh that also did something else] → Each removal
  only deletes the `refreshX()` call. Page-level `reload()` calls stay.
  Covered by the existing page tests plus new context tests.
- [Visibility events in tests/jsdom] → Tests set
  `document.visibilityState` via `Object.defineProperty` and dispatch
  `visibilitychange`.

## Migration Plan

Frontend-only and stateless. Deploy as usual. Rolling back is just
redeploying the previous image.

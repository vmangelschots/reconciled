# Design

## Context

See `proposal.md` - Why. The relevant current state:

- `transactions/categorize.py` already owns the definition of "uncategorized"
  and of a review group: `uncategorized()` is the same queryset the backfill
  tries, and `review_groups()` builds the guess cards from `needs_review()`.
- `transaction-confirm-categories` already accepts `{ids, category}` and sets
  the category as manual and confirmed, so no new write endpoint is needed.
- The Review page renders whatever `review-groups` returns, sectioned by
  `source` (`history`, `ai`), with focus rules in `ReviewPage.jsx`.
- `review-count` feeds the navigation pill; Overview's attention panel keeps
  its own two figures (`review_count`, `uncategorized_count`).

## Goals / Non-Goals

**Goals:**

- One payload, one grouping rule: what the Review page lists and what the
  backfill tries can never diverge.
- No model change or migration.
- Keep the existing guess-card behavior and keyboard model intact.

**Non-Goals:**

- Per-group "ask AI again" for a payee the model declined.
- Pagination or virtualization of very large backlogs.
- Changing import-time categorization or the Overview attention items.
- Categorizing transfers, value adjustments, splits or split parts.

## Decisions

### One `groups` array with a third source

`review_groups()` appends groups built from `uncategorized()` with
`source: "none"`, `category: null`, `evidence: null`, `reason: null`. The
frontend maps that source to the "No category yet" section and reuses the
card.

Alternatives considered:

- **A separate `uncategorized_groups` array or endpoint.** Rejected: two
  grouping implementations to keep in sync, and an extra request. The current
  page already switches on `source`, so a third value costs little.
- **Client-side fetching of the ledger filtered to no category.** Rejected:
  the ledger has no uncategorized filter, and grouping by payee belongs next
  to the existing grouping rules.

Groups are keyed on normalized payee + direction only; the category part of
the key is the literal `none`, so rows with different raw payees that
normalize alike group together. Ordering: history, then AI, then none, each
largest first and most recent first on a tie. The existing stable sort gains
a source-rank sort on top.

### The payload keeps `uncategorized_count`

The count is already the backfill's scope, and the backfill response reports
against it. The client computes the live count for the section from its
loaded groups (sum of active no-category rows), so the header stays correct
as cards leave; it does not decrement a separate copy on every action.

### The card's picker is the action

No Confirm control for `source: "none"`; the category picker is the primary
control and takes focus. Two guards in the existing group handler:

- A `null` pick (the picker's "Leave uncategorized") is a no-op for these
  groups, not a resolve. Otherwise the card would disappear while every row
  stayed uncategorized.
- The picker gets `suggestion={null}` for these groups, so it does not render
  the guessed-category (dashed/italic) style for a source that is not a
  guess.

Picking a category calls the existing `confirmCategories(ids, category)`
path, which sets the source to manual and confirms. That is also what feeds
`confirmed_history()` for the next import.

### Backfill affordance moves into the section

`EmptyState` loses its uncategorized branches and becomes the "nothing to
review" card. The "Guess categories" button, spinner, slow hint, AI outcome
lines and "Try again" move to the "No category yet" section header, so they
remain visible while rows are left. `runBackfill` still reloads groups and
reports the result by toast; leftover rows simply remain in the section.

### Badge counts the page's whole queue

`review-count` returns `needs_review().count() + uncategorized().count()`.
Overview's own attention items are untouched: they still split "guesses to
review" and "N uncategorized", both linking to Review. The nav pill's comment
and tests change; no layout change.

## Risks / Trade-offs

- **A huge first import** (thousands of uncategorized rows) would send every
  transaction of every group in one payload. → Grouping by payee caps the
  number of cards, and a household-scale backlog is a few hundred rows at
  most. If it becomes a problem, the follow-up is a per-group row cap or
  paging, not a different model. Recorded as a deliberate limit.
- **Bulk miscategorization of a mixed payee** (e.g. a marketplace). → The card
  stays expandable with per-row pickers, and the whole-group action is one
  click, so the cost of a wrong pick is a second pass over the group.
- **Backend/frontend skew** during a rolling deploy: an older frontend would
  render `source: "none"` groups under a generic "Guesses" heading with a
  Confirm button that confirms nothing. → This is a single self-hosted
  instance; ship the frontend and backend together (one PR). There is no
  migration, so rollback is a code revert.
- **Existing tests assume uncategorized rows never appear** in
  `review-groups` or `review-count`. → Update those tests as part of the
  change; the new behavior is the point.
- **Keyboard loop after the last no-category card** could land on nothing if
  the count is derived incorrectly. → Focus moves to the next visible group's
  picker or the empty heading, using the same `focusAfterGroup` path as
  today.

## Migration Plan

No database change. Deploy backend and frontend together; reverting the PR
restores the previous page without data changes.

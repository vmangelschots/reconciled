# Proposal

Issue: #84

## Why

The Review page only lists transactions whose category is an unconfirmed
guess. Transactions that neither history nor AI could categorize are not
listed there at all: they are a bare count in the empty state, even though
the Overview already sends people to Review for them and the ledger has no
"Uncategorized" filter. The payees the categorizer does not know - usually
the bulk of a backlog - therefore have no place where they can be worked
through payee by payee, and the one page about categorization is not the
place where categorization gets finished.

## What Changes

- The Review page gains a third section, "No category yet", listing every
  uncategorized transaction across accounts in groups that share a
  normalized payee and a direction, below the history and AI guess groups.
  It uses the same rows the backfill tries: no transfers, value
  adjustments, split transactions or split parts.
- Picking a category on one of those cards applies it to every transaction
  in the group and confirms them as manually categorized, so the next
  import from that payee is guessed from history. Expanding a card keeps
  the per-row pickers so one payee serving several purposes can be fixed
  row by row.
- Those cards have no Confirm action - there is no guess to confirm. Their
  category picker is the primary action and takes focus, like an AI guess
  does.
- The "Guess categories" action moves out of the empty state into the new
  section, so it stays available while rows remain. After a run, leftovers
  stay listed instead of switching the page to a "nothing matched" state.
- The Review badge in the navigation counts everything the page asks the
  user to act on: unconfirmed guesses plus uncategorized transactions.
- The empty state now only appears when nothing is unconfirmed and nothing
  is uncategorized.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `auto-categorization`: the Review page also lists uncategorized
  transactions by payee; a group's category picker can apply to rows with
  no guess; the backfill action and its reporting live in that section
  rather than the empty state; the navigation count includes uncategorized
  transactions.

## Impact

- Backend: `transactions/categorize.py` (group building), `transactions/views.py`
  (review groups and review count), `transactions/tests_review_api.py`.
  No model or migration change; `confirm-categories` already accepts
  `{ids, category}` for uncategorized rows.
- Frontend: `pages/ReviewPage.jsx`, `api/transactions.js`,
  `pages/ReviewPage.test.jsx`, navigation badge source.
- Spec: `openspec/specs/auto-categorization`.
- No change to import, categorization rules or budgets.

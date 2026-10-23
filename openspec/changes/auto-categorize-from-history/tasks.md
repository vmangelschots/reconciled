# Tasks

## 1. Confirmed state on transactions

- [x] 1.1 Add `category_confirmed` (default `True`) and `category_source` (`manual` / `history`, default `manual`) to `Transaction`, with a migration. Verify that `makemigrations --check` is clean, existing rows read as confirmed/manual, and the existing backend suite passes.
- [x] 1.2 Expose both fields read-only on `TransactionSerializer`. On create/update, any write of `category` sets `category_confirmed=True`, and `category_source="manual"` when the value changes. Verify with `transactions/tests.py` cases: PATCHing a different category confirms it and sets manual; PATCHing the same category confirms it and keeps the source; a notes-only PATCH leaves an unconfirmed row unconfirmed; clearing to null leaves confirmed/manual; the edit-form scenario (full PUT/PATCH including the unchanged category) confirms it.

## 2. History categorizer

- [x] 2.1 Implement `transactions/categorize.py` with `normalize_payee` and `categorize(transactions)` as in design decision 3: one history query, a key of normalized payee plus direction, most frequent with ties to most recent, only filling empty non-transfer rows, and `bulk_update`. Verify with `transactions/tests_categorize.py` covering every `auto-categorization` guessing scenario: repeat payee across digit/case noise, most frequent wins, tie goes to the most recent, inflow/outflow kept apart, unknown payee, an unconfirmed category not counting as history, an existing category kept, transfers skipped, and the result being unconfirmed with source `history`.
- [x] 2.2 Add a `budgets/tests.py` case: an unconfirmed category counts toward its category's monthly spend. This verifies the "unconfirmed categories count like confirmed ones" scenario with no budgets code change.

## 3. Import commit and API endpoints

- [x] 3.1 Call `categorize(created)` in `ImportViewSet.commit` after `bulk_create`, inside the atomic block, and add `categorized_count` to the response. Verify with `imports/tests.py` cases: repeat payees arrive with unconfirmed categories and the rest stay uncategorized; a line that confirms a created transfer counterpart keeps its link and gets no category.
- [x] 3.2 Add `review-groups`, `review-count`, `confirm-categories` (ids, optional category) and `categorize` (optional account) to `TransactionViewSet`, as in design decision 5. Verify with API tests:
  - groups split by payee, direction, category and source, ordered by count, with total, date span, accounts and 7-of-8 style evidence;
  - `uncategorized_count` excludes transfers;
  - `review-count` matches the number of unconfirmed rows;
  - `confirm-categories` without a category only confirms the unconfirmed rows among the given ids, and with a category sets and confirms them (source `manual`);
  - `categorize` across all accounts reports 25 of 40 for the backfill scenario and leaves transfers and categorized rows alone.
- [x] 3.3 Add `getReviewGroups()`, `getReviewCount()`, `confirmCategories(ids, category)` and `categorizeUncategorized(accountId?)` to `frontend/src/api/transactions.js`. Verify with a client test asserting the request paths and payloads.

## 4. Review UI

- [x] 4.1 Review design decisions 6 and 7 (Review page cards, the guess marker in both themes, the empty state, the nav count pill) with the UI Designer agent before building them. Fold accepted changes back into `design.md`, and verify the updated design reflects them, or that the review found nothing to change.
- [x] 4.2 Add the `suggestion` marker to `CategoryCombobox` (dashed border, italic `ink-secondary` label, `History` icon) and use it on ledger rows, with the snapshot extended to `category_confirmed`. Verify with `CategoryCombobox.test.jsx` and `TransactionsPage.test.jsx` cases: only unconfirmed rows show the marker; the column width class is unchanged; re-picking the guess with Enter shows it as confirmed without a reload; a failed save reverts to the guess and shows an error.
- [x] 4.3 Build `ReviewPage.jsx` with its `/review` route: group cards, Confirm and the group picker via `confirm-categories`, optimistic removal with revert, and the focus rule from decision 6. Verify with `ReviewPage.test.jsx` cases: groups render in count order with their evidence; Confirm confirms the group's ids and removes it; picking another category corrects the whole group; a failed confirm brings the group back with an error; focus starts on the first Confirm and moves to the next group; three Enter presses clear three groups and show the empty state.
- [x] 4.4 Add [Show N] expanded rows with per-row pickers. A row correction PATCHes only that transaction, removes it from the group, and updates the group's count and total. Verify with page tests for the "fix one row of a mixed payee" scenario and the focus moving to the next row.
- [x] 4.5 Add the empty state with [Guess categories from history]: the uncategorized count, the "Guessed N of M" result, the no-matches message, and "Every transaction has a category" when there's nothing left. Verify with page tests for the backfill and "nothing left to do" scenarios.
- [x] 4.6 Add the "Review" nav item with its count pill (fetched on route change, refetched after confirms, hidden at 0), and the import summary line with its link. Verify with `Layout.test.jsx` cases for 14 and 0, and `ImportPage.test.jsx` cases for 14 categorized (line and link) and 0 (no line).

## 5. Integration check

- [ ] 5.1 Run the backend and frontend suites, lint and build, rebuild the local stack, then use only the keyboard in the browser:
  - confirm a few categories by hand on a throwaway account;
  - import a CSV with repeat and new payees, and check the summary line, the nav count and the marked rows in the ledger;
  - on the Review page, confirm one group with Enter, correct another group, and fix one row inside a group;
  - with older uncategorized rows present, use "Guess categories from history" from the empty state;
  - check that the budgets page counts the unconfirmed guesses.

  Delete the throwaway data afterwards.

## Workflow follow-up

- Archive the change on its branch with `/opsx:archive` before the PR is merged.
- Open the PR into `main`. The AI fallback follows as its own change, which references issue #2.

# Tasks

## 1. Backend review groups

- [x] 1.1 Append groups built from `uncategorized()` to `review_groups()` with `source: "none"`, `category: null`, `evidence: null` and `reason: null`, reusing the payee/direction key; verify `transactions/tests_review_api.py` covers grouping by normalized payee, direction splits and the card fields (count, total, date span, accounts, rows)
- [x] 1.2 Order the sources history, AI, then none, keeping largest-first and most-recent-first inside each; verify a mixed test asserts the section order
- [x] 1.3 Make `review-count` return unconfirmed plus uncategorized rows; verify a test with both kinds, and one with only uncategorized, matches the badge count
- [x] 1.4 Update the tests that assumed uncategorized rows never appear (`test_confirmed_rows_are_not_listed`, `test_review_count_matches_the_unconfirmed_rows`) and run `python manage.py test transactions` to green

## 2. Review page

- [x] 2.1 Add the "No category yet" section and card variant: no Confirm, picker as the primary control, no guess styling, and a `null` pick does nothing; verify `ReviewPage.test.jsx` renders the section below the guesses and that picking a category calls `confirmCategories(ids, category)` and removes the group
- [x] 2.2 Extend the focus target and the post-resolve focus to the picker of a no-category group, including a page that opens with only those groups; verify the focus tests
- [x] 2.3 Move the backfill button, spinner, slow hint, AI outcome lines and "Try again" into the section header, and reduce the empty state to "nothing to review"; verify the backfill tests still pass with the new placement and leftovers staying listed
- [x] 2.4 Derive the no-category count from the loaded groups and add the header line for rows still without a category; verify a test resolves a card and sees the count drop
- [x] 2.5 Update the nav pill comment and `Layout.test.jsx` wording to "transactions needing review"; verify `npm test -- Layout` passes

## 3. Integration checks

- [x] 3.1 Run `npm test`, `npm run lint` and `npm run build` in `frontend/`, and `python manage.py test` in `backend/`; verify all pass
- [x] 3.2 Check the flow in the running app with the `run-reconciled` skill: an unmatched import row appears under "No category yet", picking a category clears the group, the badge drops, and a later transaction from that payee is guessed from history

## Workflow follow-up

- Archive the change on its branch once the tasks are done.
- Open the PR with `Fixes #84`.

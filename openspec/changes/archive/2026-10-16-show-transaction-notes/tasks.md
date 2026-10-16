# Tasks

## 1. Ledger notes column

- [x] 1.1 Add a Notes column to the ledger in `TransactionsPage.jsx` (header between Payee and Category, `max-w-xs truncate`, secondary ink, `title` with the full note only when there is one) and widen the full-width rows' `colSpan` from 5 to 6. Verify with a `TransactionsPage.test.jsx` test: the Notes header exists, a long note is shown with its full text as `title`, and an empty note has no `title`.
- [x] 1.2 Give the `findTable` test helper a 5s timeout, so the ledger tests don't time out under full-suite load. Verify that `npm test` passes three runs in a row.

## 2. Integration check

- [x] 2.1 Run lint and the full frontend suite, then rebuild the local frontend container and confirm in the browser that notes show in the ledger, long ones are cut off, and the full text appears on hover.

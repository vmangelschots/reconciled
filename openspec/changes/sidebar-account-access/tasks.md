# Tasks

## 1. Reaching every account

- [x] 1.1 On the Accounts page, make each account's name a link to
  `/transactions/<id>`. Verify with an `AccountsPage.test.jsx` case for
  "Open an account's transactions".
- [x] 1.2 In `Layout.jsx`'s `TransactionsGroup`, make "+N more" a button
  that expands the list, add "Show fewer", and start expanded when the
  open account is beyond the first five. Verify with `Layout.test.jsx`
  cases for "Many accounts", "Show the rest" and "The open account is one
  of the rest".

## 2. Checks

- [x] 2.1 Run `npm test`, `npm run lint` and `npm run build` in
  `frontend/`, and verify all pass.

## Workflow follow-up

- Archive the change on its branch, then open the PR with `Fixes #35`.

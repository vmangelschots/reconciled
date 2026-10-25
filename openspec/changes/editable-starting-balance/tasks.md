# Tasks

## 1. Editable starting balance

- [x] 1.1 Remove the starting-balance `validate` guard from `AccountSerializer` and the now-unused `Account.has_transactions`. Replace the two "blocked" tests in `accounts/tests.py` with one that creates a real transaction (-300.00) on a 1000.00 account, PATCHes the starting balance to 1200.00, and asserts a 200 response, a `current_balance_cents` of 90000 and an unchanged transaction. Verify that backend `python manage.py test` passes.

## 2. Check

- [ ] 2.1 In the local stack, edit the starting balance of an account that has transactions. Check that the save succeeds with no error toast, and that the accounts list, the overview total and the forecast's starting point all move by the difference. Verify that frontend `npm test`, `npm run lint` and `npm run build` still pass.

## Workflow follow-up

- Open a GitHub issue for this change on the Reconciled project and reference it in proposal.md.
- Archive the change on its branch, then open the PR with `Fixes #N`.

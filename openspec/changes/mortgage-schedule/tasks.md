# Tasks

## 1. Loan terms and the schedule

- [x] 1.1 Add `accounts.Loan` with the fields in design.md (migration),
  and add `loan`, `loan_installment`, `loan_payment` and
  `loan_linked_by_hand` to `Transaction`, with the conditional unique
  constraint (migration). Add `"accounts.Loan"` to `BACKED_UP_MODELS`.
  Verify that `python manage.py makemigrations --check` is clean and
  that the existing `backup` tests pass, including the "every model is
  listed" check.
- [x] 1.2 Add `transactions/loans.py:schedule(loan)`, which computes the
  installments with `Decimal`, as in design.md. Verify with tests for:
  - "The Belgian monthly rate" (944.22; first row 493.25 / 450.97 /
    199,549.03). The cross-check against a published Belgian
    aflossingstabel moved to 5.1: no public table could be reproduced
    (the examples found used r / 12 or included fees), so the user's own
    bank table is the reference.
  - "The last installment absorbs the rounding" (336.58, 336.58,
    336.59)
  - "A loan without interest"
  - "Month ends" (31 Jan, 28 Feb, 31 Mar)

## 2. Setup, matching and posting

- [x] 2.1 Add setup, edit (category or paying account only vs. repost)
  and remove in `loans.py`, with the line-up adjustment (installment 0),
  as in design.md. Verify with tests for:
  - "A loan running for a while" (-668.29 on 15 Feb, the 31 Jan
    installment not posted)
  - "A new loan"
  - a line-up replacing an ordinary adjustment on the setup day
  - "Correcting the rate" (everything reposted; non-equal automatic
    matches dropped; hand links kept, with their values updated)
  - "Changing the category" (no repost, matches kept)
  - "Removing the setup" (balance unchanged, adjustments ordinary and
    deletable)
- [x] 2.2 Add `sync_loan` and `sync_loans`: drop stale matches (with the
  hand-link exceptions), match due installments up to 5 days ahead, post
  adjustments, and apply the payment category. Verify with tests for:
  - "The payment is booked two days late"
  - "A different amount doesn't match"
  - "Too far from the date"
  - "Two loans paid from one account on the same day"
  - closest date wins
  - transfers, splits and adjustments never match
  - one payment never matches two installments
  - "Net worth drops by the interest"
  - "An uncategorized payment" / "The user's own category stays"
  - "The payment is deleted", "An automatic match's amount changes", and
    unmatching after a transfer and a split (a transaction's account
    can't be changed, so a move to another account can't happen)
  - "Shown twice" (idempotent, and the unique constraint holds when
    sync runs twice)
- [x] 2.3 Add link candidates, link and unlink in `loans.py`. Verify with
  tests for:
  - "Booked a week late"
  - "Paid by hand from savings"
  - "A cent off" (listed first; the link survives sync and an amount
    edit)
  - "Unlink a wrong choice"
  - a link being rejected for a posted installment, an installment before
    setup, or a non-candidate transaction
- [x] 2.4 Add the guards:
  - `destroy` rejects scheduled adjustments
  - `set_value` rejects a date holding a scheduled adjustment
  - `link_transfer` rejects a scheduled loan as the target from its
    paying account

  Expose `loan_installment`, `loan_term_months` and `loan_match` in the
  transaction serializer, and `has_loan` and `loan_paid_from` in the
  account serializer. Verify with tests for:
  - "A scheduled adjustment is not replaced"
  - deleting a scheduled adjustment through the API (400)
  - "A scheduled loan is not a transfer target from its payer" (API
    side)
  - that ordinary adjustments can still be deleted and replaced, and
    that ordinary transfers to a loan without a setup still work

## 3. API and call sites

- [x] 3.1 Add `GET/PUT/DELETE /api/accounts/{id}/loan/`,
  `POST …/loan/preview/` and the installment `candidates/` and `link/`
  endpoints, with validation and installment states, and with GET
  syncing first. Verify with API tests for:
  - "Set up the mortgage"
  - "Invalid terms are rejected" (amount 0, negative rate, term 0, the
    loan itself or another loan as payer, an archived payer)
  - "Not offered on other accounts" (400 on a checking account)
  - "Terms that match the bank" / "Terms that don't match" (preview,
    with nothing saved)
  - the repost counts in an edit preview
  - "States in the table" / "A missed installment"
  - 404 for a loan without a setup
- [x] 3.2 Call `sync_loans` from the overview view,
  `TransactionViewSet.list` and the end of the import commit, and add
  `missed_loans` to the overview's attention data. Verify with tests for:
  - "After an import" (the commit brings in the payment, and the loan
    ledger then shows the adjustment)
  - "A payment not seen" (with the second-line fields)
  - "Still within the window"
  - "A later payment matched"
  - "A loan without a setup" (never listed)
- [x] 3.3 Make `generate_forecast` follow the schedule for a loan with a
  setup, using "Installment N of M" as the payee. Verify with
  `forecasting` tests for "The mortgage over the next months", "After
  the last installment" and "A loan without a setup".
- [x] 3.4 Verify with a `backup` test for "A loan schedule survives": a
  round trip keeps the terms, the links and the hand-link flags, and a
  sync after the restore posts nothing new.

## 4. Frontend

- [ ] 4.1 Add the loan API calls to `frontend/src/api/`, and
  `LoanSchedulePage` at `transactions/:accountId/schedule` with the
  header and the setup/edit panel, as in design.md:
  - the live preview, debounced on the preview endpoint
  - the repost warning
  - Remove with its confirm dialog
  - the not-set-up and not-a-loan states

  In the loan ledger header, show "Set value" plus "Set up schedule"
  without a setup, and only "Schedule" with one. Verify with
  `LoanSchedulePage` tests for:
  - setting up, including "Terms that match the bank" and "Terms that
    don't match"
  - editing, with the repost warning and "Changing the category"
  - "Removing the setup"
  - "The header"
  - "A loan without a setup"

  Verify with a `TransactionsPage` test for "Not offered on a loan with
  a schedule".
- [ ] 4.2 Add the schedule table: columns from `sm` up and two-line rows
  below, the states and tokens from design.md, the "Set up" divider, the
  windowing with "Show earlier" and "Show all", `?installment=N`, and
  "Link payment" / "Unlink". Verify with `LoanSchedulePage` tests for:
  - "States in the table"
  - "A missed installment"
  - "A long loan" (the window and both controls)
  - linking and unlinking a payment

  Check it at 390px wide ("On a phone"): no sideways scrolling.
- [ ] 4.3 In the ledger:
  - render a scheduled adjustment with "Installment N of M" or "Schedule
    start" in the category cell, linking to the schedule, with no Delete
  - tag a matched payment with "<Loan> · installment N"
  - leave a scheduled loan out of its paying account's transfer targets

  Verify with `TransactionsPage` tests for "A scheduled adjustment in the
  ledger", "The line-up in the ledger", "Tag on the payment" and "A
  scheduled loan is not a transfer target from its payer", and that an
  ordinary adjustment keeps Delete.
- [ ] 4.4 Add the "<Loan>: payment of <d Mon> not seen" item with its
  "Installment N of M · €… from <account>" line to Needs attention,
  between the yearly warnings and the stale import, linking to the
  schedule at that installment. Verify with `OverviewPage` tests for the
  updated "Everything that needs attention" order and "A payment not
  seen".

## 5. End-to-end check

- [ ] 5.1 In the running app:
  - set up both real loans, paid from the same checking account, and
    check that the preview finds each loan's recent payments and that
    the first rows match the bank's aflossingstabel
  - import or add the monthly payments, and check that:
    - each loan ledger shows its own installment's adjustment
    - net worth drops only by the interest
    - each payment is tagged and categorized
    - the budget counts the full payments
  - delete one payment, check that its installment shows "Missed" with
    a Needs attention item once 5 days have passed (use a back-dated
    installment), then post it again with "Link payment"

  Then run `npm test`, `npm run lint`, `npm run build` and
  `python manage.py test`.

## Workflow follow-up

- Open an issue for the net-worth projection across accounts, which is
  out of scope here.
- Archive the change on its branch before the PR is merged, and open the
  PR with `Fixes #25`.

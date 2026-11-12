# Tasks

## 1. Loan categories: adopt, release and guards

- [ ] 1.1 Add `budgets/loan_categories.py` (`loan_categories`, `adopt`, `release`; imports only models) and call it from `set_up_loan`, `edit_loan` (only when the category changed) and `remove_loan`; verify with tests: setting up "House A" with "Mortgage" (1,400.00 limit) deletes the limit and makes it Bills; a second loan joining keeps it; clearing the only loan's category, or removing its setup, makes it monthly without a limit; removing one of two loans keeps it Bills; editing only the rate doesn't touch the category
- [ ] 1.2 Reject `set_budget`, `set_limit` and `set_bills` on a loan category with "Its loans set this budget. Change it on the loan.", and add `loans` ([{account_id, name}], active accounts only, one prefetch query) to `CategorySerializer`; verify with API tests for each rejection, the serialized loans, and that an archived loan account doesn't count
- [ ] 1.3 Add a `budgets` data migration adopting every current payment category of a loan on an active account (reverse: back to monthly); verify with a migration test (`MigrationExecutor` or a direct call of the migration function) that a category with a limit and a loan ends up Bills with no limit, and `makemigrations --check` is clean

## 2. Loan bill lines

- [ ] 2.1 Add `budgets/loan_bills.py` `loan_lines(month, today)` from `installment_states` (skip before-setup and covered; posted → paid with payment date and amount; else `bill_state`), lines with `source: "loan"`, `loan_account_id` and id `loan-<account>-<number>`; verify with DB tests for the spec scenarios: two house loans totalling 1,470.00, a correction lowering December to 1,400.00 after a paid November, a paid-off loan's last month, a covered installment, matched on the 8th → paid on 8 Nov, unmatched on 10 Nov → not seen, a past month → missed
- [ ] 2.2 Pass `loan_lines` through `budget_rows` into `monthly_limits` and `bill_rows`, and skip loan lines in `attention_bills`; verify with tests: "Mortgage" budget 1,470.00 counts in the totals and the tile marker, 35.00 insurance in "Mortgage" makes it 35.00 over, a missed House A installment appears in `missed_loans` but not in `attention.bills`, and the summary query count stays constant with two loans
- [ ] 2.3 Call `sync_loans` in `BudgetSummaryView`; verify with a test that a payment arriving after setup shows House A as paid on the Budgets summary without opening the overview

## 3. Frontend

- [ ] 3.1 Add `paymentCategoryNote(category, loan, categoriesById)` to `lib/loans.js` (warning naming the replaced monthly / yearly / bills budget; muted "Joins … in …'s bills"; muted "… goes back to no budget"; null otherwise) and render it under the payment category in `LoanForm`; verify with `loans.test.js` cases for each branch and a `LoanSchedulePage` test showing the amber warning when picking "Mortgage" with a limit
- [ ] 3.2 Mark loan categories in `CategoryCombobox` (muted `Landmark`, title "Budget set by loans: …"), show "Set by N loans: …" with schedule links instead of the form in `BudgetEditor`, and mark loan lines (icon + schedule link) in the sheet's `BillList`; verify with component tests for the picker icon and title, the Mortgage editor without a kind switch, and a loan line linking to `/transactions/<id>/schedule`
- [ ] 3.3 Show "Missed" in the critical colour on the loan schedule and the Overview's missed-loan item; verify by updating the existing `LoanSchedulePage` and `OverviewPage` tests to expect `text-critical`; then run `npm test`, `npm run lint`, `npm run build`

## 4. Integration check

- [ ] 4.1 Run `python manage.py test` and the app locally: give "Mortgage" a monthly limit, set up "House A" and "House B" with it as payment category (see the warning, then the note), and confirm on Budgets that "Mortgage" shows two loan bills with no pace marker and no limit, a matched installment as paid, the editor's "Set by 2 loans", the picker's bank icon, and a missed installment only as the loan's red line in Needs attention; clear one loan's category and remove the other's setup and confirm "Mortgage" goes back to no budget

## Workflow follow-up

- Open a PR from `change/loan-bills` with `Fixes #61`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

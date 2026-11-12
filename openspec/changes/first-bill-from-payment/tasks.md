# Tasks

## 1. Backend

- [x] 1.1 Make `bill_rows` return figures for every non-loan Bills category, with `bills: []`, all its outflows (and its subcategories') as `extras`, and the usual `review` flag when no bills count in the month; verify with tests: "Streaming" without bills and a PayPal 7.99 on 18 November has that payment in `extras`, `review` true in November and false in September, and its summary row still has no limit and isn't over; then run `python manage.py test budgets`

## 2. Frontend

- [x] 2.1 In `lib/budgetOverview.js`, give a Bills row without a limit `bills: []`, `billLines: []`, `through`, `review` and `overCents: 0` while keeping the "€X spent" figure and No budget grouping; in `BudgetSheet.jsx` hide the empty bill bar and show "No bills yet" in the bill list (mentioning "from a payment above" only when "To review" is shown); verify with `budgetOverview` tests for the row and `BudgetSheet.test.jsx` cases for the spec scenarios (sheet lists the 7.99 with Add as bill and "No bills yet"; September shows no "To review"); then run `npm test`, `npm run lint`, `npm run build`

## 3. Integration check

- [ ] 3.1 Run the app locally: make "Streaming" a Bills category without bills, add a PayPal payment of 7.99 this month, open it from the No budget group, add the payment as "Apple TV", and confirm "Streaming" becomes a Bills row with "Paid"

## Workflow follow-up

- Open a PR from `change/first-bill-from-payment` with `Fixes #69`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

# Tasks

## 1. Matching

- [ ] 1.1 Rewrite `budgets/bills.py` `match` as global pairing within the month (pairs inside the amount window, sorted by amount difference, distance to the bill's day, bill day, bill id, outflow id; greedy), removing `MATCH_DAYS`; verify by updating `MatchTests` ("too far from its day" now pays) and adding tests for: every payee PayPal, an earlier bill not taking a later bill's payment (Disney+/Spotify on 22 Nov), same amount three days apart, and an outflow paying at most one bill

## 2. Bill history and data

- [ ] 2.1 Add `Bill.until_month`, the `BillMonthAmount` model and `Transaction.bill_extra` with their migrations; make `bill_rows` count a bill while `from_month <= M <= until_month`, use its month amount as `amount_cents`/expected, add `month_only`, `difference_cents`, the `paid_under` state and per-row `extras` (unmatched outflows with payee and `extra`, empty for loan categories); verify with tests: an ended bill no longer counts, a one-month amount applies only in its month, a 15.99 payment for 17.99 is paid under by 2.00, extras list the PayPal 7.99 with its payee, a split part and a subcategory outflow still match, and `makemigrations --check` is clean
- [ ] 2.2 Make `CategorySerializer.bills` list only bills counting in the current month, and `PUT .../bills/` delete only current bills left out; verify with tests: after a split the editor lists Netflix once at the new amount, and saving the editor keeps the ended part
- [ ] 2.3 Add `budgets.BillMonthAmount` to the backup's `BACKED_UP_MODELS` and clear order; verify with `backup/tests.py`: a bill with an end month, a one-month amount and a payment marked extra round-trips, and a backup without the new model or field restores

## 3. Sheet actions API

- [ ] 3.1 Add `POST categories/{id}/bills/{bill_id}/amount/` (scope `from_month` splits or updates in place, moves later month amounts to the new bill; scope `month` upserts the month amount); verify with API tests for the spec scenarios: Update from November keeps October at 17.99, Update from October keeps September, Just this month affects November only, updating in the bill's first month changes it in place, and a loan category is refused
- [ ] 3.2 Add `POST categories/{id}/bills/from-payment/` (outflow in the category or its subcategories; day and absolute amount from it; scope `every_month` or `month`) and `POST categories/{id}/extras/` (set or clear `bill_extra`); verify with API tests: adding the PayPal 7.99 as "Apple TV" every month makes a paid bill from November and removes it from extras, "only this month" isn't in December, marking extra keeps it in extras with `extra: true` and the category still over, undo clears it, an inflow or another category's transaction is refused, and loan categories are refused

## 4. Frontend

- [ ] 4.1 Add `setBillAmount`, `addBillFromPayment` and `setPaymentExtra` to `api/categories.js`; add `paid_under` to `BILL_TONE` and `billLabel` ("€2.00 under", neutral) and a `billPrompt(bill)` text helper ("Paid €19.99, expected €17.99. Update the bill?") in `lib/budgetOverview.js`, and pass `extras` through `billsRow`; verify with `api/categories.test.js` and `budgetOverview` tests for the labels and prompt text
- [ ] 4.2 Add the over segment to `BillBar` (shown only when spent exceeds the budget, `flexGrow = min(over, bills total)`, striped critical fill, title "€… beyond the bills"), with `billsRow` passing `overCents`; verify with `BillBar.test.jsx`: present when over with the capped width, absent when under, and the Budgets row shows it for "Spending money"
- [ ] 4.3 In `BillList`: the price prompt inset under paid-over and paid-under manual lines with Update and Just this month, the "Not a bill" group with Add as bill, It's extra and Undo, and the inline add form (name prefilled from the payee and selected, day and amount as text, Every month / Only <Month>, Enter saves); after each action toast, reload the summary and categories, and re-key `BudgetEditor`; no prompts or group for loan lines; verify with `BudgetSheet.test.jsx` cases for each spec scenario (Netflix went up → Update and Just this month calls, add PayPal as Apple TV, only this month, mark extra and undo, loan category without prompts); then run `npm test`, `npm run lint`, `npm run build`

## 5. Integration check

- [ ] 5.1 Run `python manage.py test` and the app locally with "Streaming" (Netflix 17.99, Disney+ 11.99, Spotify 10.99, all payees "PayPal", one paid 19.99, one paid a week late, an unknown 7.99) and "Spending money" with an extra 50.00: confirm the matches, the price prompt and both choices (October keeps 17.99 after Update), adding the 7.99 as a bill, marking the 50.00 as extra (still over, striped segment on the bar), and no prompts on a loan category

## Workflow follow-up

- Open a PR from `change/bill-price-updates` with `Fixes #62`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

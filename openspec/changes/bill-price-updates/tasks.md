# Tasks

## 1. Matching

- [x] 1.1 Rewrite `budgets/bills.py` `match` as global pairing within the month (pairs inside an amount window of the larger of 15% and 2.00, sorted by amount difference, distance to the bill's day, bill day, bill id, outflow id; greedy) and remove `MATCH_DAYS`; verify by updating `MatchTests` (too far from its day now pays; the old 5.00 window case no longer matches) and adding tests for: every payee PayPal, an earlier bill not taking a later bill's payment (Disney+/Spotify on 22 Nov), same amount three days apart, an 8.00 outflow not paying a 10.99 bill, and an outflow paying at most one bill

## 2. Bills from the viewed month on

- [x] 2.1 Add `Bill.until_month` with its migration and make `bill_rows` count a bill while `from_month <= M <= until_month`; verify with tests that an ended bill no longer counts and `makemigrations --check` is clean
- [x] 2.2 Add `apply_bills(category, month, lines)` and have `PUT .../bills/` take the viewed `month` (default: current) and apply from it on (new from M; change in place when it started in M, else end the old bill at M−1 and start a new one; missing bills deleted when they started in M, else ended at M−1; bills not counting in M untouched); verify with API tests for the spec scenarios: a price change in November keeps September and October at 17.99, removing Disney+ in November keeps October, a change in the bill's first month stays one bill, and saving from October applies from October on
- [x] 2.3 Verify backups keep the months: extend `backup/tests.py` so a bill ended in October plus its successor round-trip with the same months, and an older backup without `until_month` restores

## 3. Review data and Add as bill

- [x] 3.1 Add `paid_under` and `difference_cents` to bill lines, `extras` (unmatched outflows with payee; empty for loan categories) and `review` (current or previous month) to Bills rows, and the over margin (larger of 5% and 1.00) to Bills rows' `over_limit` and `attention_categories`; verify with tests: 15.99 for 17.99 is paid under by 2.00, extras list the PayPal 7.99 with its payee, `review` is true for November and October on 19 November and false for September, Streaming 2.00 over its 40.97 is not over and not in Needs attention, Spending money 50.00 over still is
- [ ] 3.2 Add `POST categories/{id}/bills/from-payment/` (outflow in the category or its subcategories; day and amount from it; from its month on; refused for inflows, other categories, loan and non-Bills categories); verify with API tests for "A new subscription through PayPal" and each refusal

## 4. Frontend

- [ ] 4.1 Add `setCategoryBills(id, bills, month)` and `addBillFromPayment` to `api/categories.js`; in `lib/budgetOverview.js` add `paid_under`, signed difference chips ("+€2.00", "−€2.00"), the review lines (price lines and extras) and `overCents` in `billsRow`; verify with `api/categories.test.js` and `budgetOverview` tests for the chips, the price line text and that review lines are empty when `review` is false
- [ ] 4.2 Add the solid over segment to `BillBar` (only when the row is over, `flexGrow = min(over, bills total)`, title "€… beyond the bills"); verify with `BillBar.test.jsx` (present and capped when over, absent otherwise)
- [ ] 4.3 Restructure the Bills sheet: "To review" block under the header (Update as one editor save with the viewed month; Add as bill with an inline name field prefilled with the payee and selected), the bill list once with "Edit bills" swapping in the editor lines with the kind switch and "Changes apply from <Month> on", and transactions collapsed to "N transactions in <Month> ›"; no review block or Edit bills for loan categories; toasts, reload and editor re-key after each save; verify with `BudgetSheet.test.jsx` cases for Netflix went up → Update, adding the PayPal 7.99 as Apple TV, no review block in September, Edit bills and save from November, a loan category without prompts, and the collapsed transactions; then run `npm test`, `npm run lint`, `npm run build`

## 5. Integration check

- [ ] 5.1 Run `python manage.py test` and the app locally with "Streaming" (Netflix 17.99, Disney+ 11.99, Spotify 10.99, all payees "PayPal", Netflix paid 19.99, Spotify paid a week late, an unknown 7.99) and "Spending money" with an extra 50.00: confirm the matches, Update keeps October at 17.99, adding the 7.99 as a bill, the "To review" block shows in November and October but not September, Streaming isn't over for the 2.00, Spending money shows the red over segment, the sheet fits about one phone screen, and a loan category shows no prompts

## Workflow follow-up

- Open a PR from `change/bill-price-updates` with `Fixes #62`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

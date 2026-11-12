# Tasks

## 1. Bill model and API

- [ ] 1.1 Add `Category.BudgetKind.BILLS` and the `budgets.Bill` model (category, name, day 1–31, amount_cents > 0, from_month, timestamps) with its migration; verify `python manage.py makemigrations --check` is clean after the migration and a model test rejects day 0/32 and amount 0 via `full_clean`
- [ ] 1.2 Extend `set_budget` for `kind: "bills"` (no amount; switching to Bills deletes limits or yearly rows, switching away deletes bills) and add `bills` to `CategorySerializer`; verify with tests in `budgets/tests.py` for monthly→bills, yearly→bills, bills→monthly and the serialized bills
- [ ] 1.3 Add `PUT /api/categories/{id}/bills` (replace list: keep ids and their `from_month`, new lines get the current month, delete missing; 400 for non-Bills category, bad day, empty name, amount <= 0; tabs rejected); verify with API tests for create, edit-keeps-from_month, delete and each rejection

## 2. Matching and states

- [ ] 2.1 Add `budgets/bills.py` pure functions `due_date`, `amount_window`, `paid_tolerance`, `match` and `bill_state` with the constants from design.md; verify with DB-free unit tests covering the spec scenarios: 31st in February, a day late, too far from its day, not across months, two candidates (closest amount wins), two same-amount bills, paid, paid over by 2.00, due soon, not seen 22–26 Nov, missed from 27 Nov, missed once a past month ended, future month upcoming
- [ ] 2.2 Add the DB layer `bill_rows` (bills counting from `from_month`, outflows from `counted_rows().excluding_adjustments()` in the category and its subcategories, one query) returning per-bill state, `paid_on`, `paid_cents`, `over_cents`, plus `paid_count`, `due_to_date_cents`, `unpaid_cents`; verify with DB tests including a bill added in November not counting in October and a split part paying a bill

## 3. Summary, totals and attention

- [ ] 3.1 Make `monthly_limits` include Bills totals and `budget_rows` emit Bills rows (`kind`, `bills`, counts) next to monthly rows with `kind: "monthly"`; verify with tests that a Bills category's budget counts in `budget_totals`, a Bills subcategory under a monthly parent is a cap, and a Bills category without bills has no budget
- [ ] 3.2 Add `marker` and `bills_unpaid_cents` to `budget_totals` for the current month; verify with a test reproducing the "Pace with bills" scenario (marker 44%, unpaid 100.00) and one showing `marker == pace` without bills
- [ ] 3.3 Skip the ahead rule for Bills in `attention_categories`, add `attention_bills` (missed bills, by due date then name), and return `attention.bills` from `BudgetSummaryView` and the overview endpoint; verify with tests in `budgets/tests.py` and `reports/tests_overview.py`: Streaming all paid on 8 Nov not listed, Spending money 50.00 over listed as a category warning, Spotify missed listed on 28 Nov and not on 23 Nov

## 4. Backup

- [ ] 4.1 Add `budgets.Bill` to `BACKED_UP_MODELS` and the restore order; verify with `backup/tests.py`: the model-coverage test passes, a Bills category with a bill round-trips with the same `from_month`, and a backup without Bill rows restores

## 5. Frontend data and wording

- [ ] 5.1 Add `api/categories.js` `setCategoryBills` and accept `kind: "bills"` in `setCategoryBudget`; verify with a test of the request shape
- [ ] 5.2 In `lib/budgetOverview.js` add `BILL_TONE`, `billsRow` (figure "€X to pay" / "Paid" / "€N over", caption "n of m paid · <most pressing>"), `billWarning` ("Spotify missed", "Streaming · due 21 Nov · €11"), include bill items in `verdict`, and route Bills rows in `budgetList`; verify with `budgetOverview.test.js` cases for the "Two of three paid", "All paid" and "A missed bill" scenarios and the verdict count

## 6. Frontend UI

- [ ] 6.1 Add `components/BillBar.jsx` (segments sized by amount, fills from `BILL_TONE`, same track as `ProgressBar`) and render it in `BudgetRow` and the `BudgetSheet` header when `row.bills` is set; verify with a component test: segment widths follow amounts, missed segment uses the critical fill, no pace marker
- [ ] 6.2 Add Bills to `BudgetEditor`'s kinds with the inline bill list (day, name, amount, remove, "+ Add bill", total, day hint), `droppedSentence` for both directions, and saving through `setCategoryBudget` + `setCategoryBills`; verify with tests: switching monthly→Bills shows the limit-removal dialog, adding Spotify saves the three bills with 40.97 total, Bills→monthly says "its 3 bills"
- [ ] 6.3 List the month's bills with state chips in the Bills sheet (paid with date, "€2.00 over", in N days, not seen, missed, no chip when upcoming); verify with a `BudgetSheet.test.jsx` case for "The Streaming sheet" scenario
- [ ] 6.4 Use `totals.marker` and `bills_unpaid_cents` for the Overview tile and the Budgets headline (marker and per-day), and show `attention.bills` in the Overview's Needs attention (after yearly, before missed loans) and in Needs a look; verify with `OverviewPage`/`BudgetsPage` tests for the order and the "€14 a day" per-day figure; then run `npm test`, `npm run lint`, `npm run build`

## 7. Integration check

- [ ] 7.1 Run backend tests (`python manage.py test`) and the app locally: make "Streaming" a Bills category with three bills, add matching transactions, and confirm the row, sheet, Needs attention (missed after the grace period), the tile marker and per-day, and that nothing is "ahead of pace"; switch it back to monthly and confirm the dialog

## Workflow follow-up

- Open a PR from `change/bill-budgets` with `Fixes #60`; merge only after CI passes and when asked.
- Archive the change on its branch before the PR is merged.

# Proposal

Issue: #69

## Why

"Add as bill" (#62) only appears in a Bills category's "To review" block,
and a Bills category without bills never gets that block:
- Its row is a plain "€X spent" in the No budget group.
- Its sheet shows the old layout, without a bill list or "To review".

So a new Bills category, like "Streaming" with only PayPal payments, can't
turn a payment into its first bill. You have to type that bill in the
editor first, which defeats the point of promoting a payment.

## What Changes

- **A Bills category without bills opens the Bills sheet anyway:**
  - "To review" lists its payments for this month and last, each with Add
    as bill.
  - The bill list says "No bills yet", with Edit bills.
  - Transactions are folded away, as for any Bills sheet.
- **Its row keeps reading "€X spent".** It still has no budget, and stays in
  the No budget group until it gets its first bill. After that it becomes
  a normal Bills row.
- Loan categories are unchanged: they always have their loan bills.

Out of scope: promoting a transaction to a bill from the Transactions page,
and making a category a Bills category from a transaction.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `bill-budgets`: a Bills category without bills still shows the Bills
  sheet, with its payments to review, so its first bill can come from a
  payment.

## Impact

- Backend: `budgets/bills.py` `bill_rows` also returns a row for Bills
  categories without bills that count in the month. That row has no
  bills, its outflows as `extras`, and the `review` flag. `budget_rows`
  passes these through, and the limit stays empty (no budget). No API or
  model change.
- Frontend: `lib/budgetOverview.js` gives a Bills category without bills a
  row that keeps its "€X spent" figure but carries `bills: []`,
  `billLines: []` and its review items. In `BudgetSheet.jsx`, the header
  shows no empty bill bar, and the bill list shows "No bills yet".
- No migration, no new dependencies.

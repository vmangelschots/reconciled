# Design

## Context

- **Backend:** `bill_rows` (`backend/budgets/bills.py`) only builds figures
  for Bills categories with bills that count in the month. The
  `bills_by_category` loop drops the rest. `budget_rows` then gives such a
  category `bills: []`, `extras: []` and `review: False`.
- **Frontend:** `budgetList` routes a Bills row with `limit_cents == null`
  to `monthlyRow`, so it renders as an unbudgeted "€X spent" row in the No
  budget group. Its sheet takes the non-Bills path in `SheetBody`, because
  `row.bills` is unset, so there's no "To review" and no Add as bill.

See proposal.md for the motivation and specs/ for the behaviour.

## Goals / Non-Goals

**Goals:**
- A Bills category without bills gets the Bills sheet, with its payments
  under "To review", so its first bill can come from a payment.

**Non-Goals:**
- Changing the "no bills, no budget" rule. Its row stays "€X spent" in the
  No budget group.
- Any entry point outside the Budgets sheet.

## Decisions

### `bill_rows` includes every non-loan Bills category
`bill_rows` builds a figure set for every Bills category it's given, not
only those with bills. When there are no bills:
- `bills` is `[]`.
- Every outflow of the category (and its subcategories, as for any Bills
  category) is listed in `extras`.
- `review` follows the usual current-or-previous-month rule.
- `budget_cents` and `due_to_date_cents` are 0.

Loan categories behave as before. `budget_rows` keeps the limit from
`monthly_limits`, which has no entry for a category without bills, so the
row still has no budget and `over_limit` stays false.

*Alternative:* a separate endpoint for the sheet's payments. Not needed:
the summary already carries `extras` for Bills rows, and keeping one path
means the first bill and later ones work the same.

### The frontend keeps the "€X spent" row but marks it as Bills
`budgetList` builds a Bills row without bills from `monthlyRow`, so the
figure, caption and No budget grouping are unchanged, and adds:
- `bills: []`, `billLines: []` and `through`;
- `review: reviewItems(row)`;
- `overCents: 0`.

`SheetBody` then takes the Bills path. In `BudgetSheet.jsx`:
- `SheetHeader` shows the `BillBar` only when there are bills.
- `BillList` with no lines shows "No bills yet. Add one with Edit bills,
  or from a payment above." Above only appears when "To review" is there,
  so outside the review window the text drops the second part.

## Risks / Trade-offs

- [More rows in `bill_rows` load more outflows] → One query either way,
  since outflows load in one query for all Bills categories. Only the
  category set grows.
- [A Bills category without bills sits inside the collapsed No budget
  group] → The user finds it there, which is consistent with "no budget".
  After the first bill it moves up as a normal Bills row.

## Migration Plan

None. Code only.

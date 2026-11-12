# Proposal

Issue: #61

## Why

Loans already know each installment's date and amount, and match the
payment that pays it. Their payment category (the two house loans both go
to "Mortgage") still needs a typed-in monthly budget, and that budget is
judged against the month's pace. So a mortgage paid on the 7th gets
"ahead of pace" warnings, and the limit goes out of date after every
correction. With Bills now in place (#60), a loan's payment category can
simply take its bills from the loans.

## What Changes

- **A loan's payment category becomes a Bills category whose bills come
  from the loans.**
  - Each active loan that pays into the category adds one bill line per
    installment dated in the month: the loan's name, the installment's
    day, and its amount.
  - Several loans can share one category.
  - Installments before the loan's setup, and installments covered by a
    balance correction, aren't bills.
  - Corrections and the end of a loan change the budget automatically.
- **A loan category has no manual bills or limits.** You can't add or edit
  bills there, set a limit, or change its kind. Spending beyond the
  installments counts as over.
- **A loan bill's state comes from the loan:**
  - An installment matched to a payment is paid on that payment's date.
  - Otherwise the usual bill states apply (upcoming, due soon, not seen,
    missed).
- **No duplicate warnings.** Missed loan bills stay out of the bill
  warnings in Needs attention. The existing missed-payment line for the
  loan covers them.
- **Choosing a payment category replaces the category's own budget.**
  - Choosing a category that has a monthly limit, a yearly budget or
    manual bills deletes them when the loan is saved.
  - Before saving, the loan form shows an amber warning under the field,
    e.g. "Mortgage's €1,400 monthly budget will be replaced by this
    loan's payment."
  - A category that already follows loans shows a muted note instead:
    "Joins House A in Mortgage's bills."
- **Removing a loan's payment category, or its setup**, puts the category
  back to no budget once no active loan pays into it. The loan form says
  so before saving.
- **Loan categories are marked:**
  - The category picker shows a muted bank icon on loan categories, with
    "Budget set by loans: House A, House B" on hover.
  - The budget editor of a loan category shows "Set by 2 loans" with
    links, instead of the kind switch.
  - Loan bill lines in the sheet carry the same icon and link to their
    schedule.
- **Missed is red everywhere.** The loan schedule's "Missed" and the
  Overview's missed-payment line change from the warning colour to the
  critical colour, matching missed bills and overdue targets.
- **The Budgets page brings loan matches up to date** when it loads, like
  the Overview and the ledger already do.

Out of scope: loans that aren't annuities, splitting one installment over
several categories, and #62–#65.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `bill-budgets`: loan payment categories take their bills from the
  loans, can't be budgeted by hand, and keep their missed bills out of
  the bill warnings.
- `loan-schedules`:
  - Choosing a payment category replaces its budget, with a warning
    before saving.
  - Removing the payment category or the setup puts that category back
    to no budget.
  - Matches are brought up to date when the Budgets page loads.
  - "Missed" moves to the critical colour.
- `overview`: the missed loan payment line uses the critical colour.

## Impact

- Backend:
  - A new `budgets/loan_bills.py` builds a month's loan bill lines with
    their states from `installment_states`, and hooks the payment
    category in and out (`adopt` / `release`).
  - `transactions/loans.py`: `set_up_loan`, `edit_loan` and `remove_loan`
    call the hooks.
  - `monthly_limits`, `bill_rows` and `attention_bills` include or skip
    loan lines.
  - `set_budget`, `set_limit` and `set_bills` reject loan categories.
  - `CategorySerializer` gains `loans`.
  - `BudgetSummaryView` calls `sync_loans`.
- Frontend:
  - `CategoryCombobox` gets the loan marker.
  - `LoanSchedulePage` gets the payment-category warning and note, and
    "Missed" in red.
  - `BudgetEditor` shows the "Set by loans" note.
  - `BudgetSheet` marks loan lines.
  - The Overview's missed-loan item turns red.
- No migration, no new dependencies, and no backup change: loan bills are
  computed, never stored.

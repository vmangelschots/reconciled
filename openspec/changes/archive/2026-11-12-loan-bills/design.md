# Design

## Context

Bills (#60) are computed per request:
- `budgets/bills.py` `bill_rows` matches stored `Bill` rows to the month's
  outflows.
- `monthly_limits` adds each Bills category's total, so `budget_rows`,
  `budget_totals` and attention treat it like a limit.
- `attention_bills` lists missed bills.

Loans live in `accounts.Loan` (with an optional `payment_category`).
`transactions/loans.py` computes the schedule (`schedule`,
`installment_states`) and stores matches as adjustments (`sync_loan`).
`sync_loans` runs when the Overview, a ledger or a schedule loads and after
an import, but not on the Budgets page.

`transactions/loans.py` imports `accounts` and `transactions` only, never
`budgets`. See proposal.md for the motivation and specs/ for the behaviour.

## Goals / Non-Goals

**Goals:**
- Loan bills ride the existing Bills pipeline (rows, totals, marker,
  sheet), so the UI needs only markers.
- One source of truth for a loan bill's state: the loan's own matching.
  Bills matching never touches loan payments.

**Non-Goals:**
- Storing loan bills as `Bill` rows.
- Mixing manual bills and loan bills in one category.
- A toast after saving. The warning shown before saving is the
  confirmation.

## Decisions

### Loan lines follow the schedule's states
`budgets/loan_bills.py` provides `loan_lines(month, today)`, which returns
`{category_id: [line]}`:
- For every loan on an active account with a payment category, it takes
  the installments dated in `month`, skipping `before_setup` and
  `covered`, by the same rules as `installment_states`. It loads every
  loan's adjustments and corrections in one go (three queries in all),
  instead of calling `installment_states` per loan.
- A `posted` installment is `paid`, with `paid_on` and `paid_cents` from
  `adjustment.loan_payment`.
- Any other installment gets `bills.bill_state(amount, due, None,
  ref_day, month_over, future)`. That yields due soon, not seen and
  missed by the same 3/5-day rules, and `missed` once the month has
  ended. The loan's own missed rule is also "more than 5 days past", so
  the two agree.
- Each line has the shape of a manual bill line, plus `source: "loan"` and
  `loan_account_id`. Its `id` is `"loan-<account_id>-<number>"`, so it
  never collides with a `Bill` id.

*Alternative:* materialize `Bill` rows when a loan is saved, and keep
them in sync after corrections and edits. That needs sync on every loan
change and a second matching engine fighting the loan's. Computing from
the schedule is always right.

### Wiring into the Bills pipeline
- `budget_rows` computes `loan_lines` once and passes it to
  `monthly_limits(period_start, loan_lines)` and to `bill_rows`.
  `yearly_spent_cents` also calls `monthly_limits` and needs only the
  totals.
- `monthly_limits` adds the loan line totals for loan categories.
- `bill_rows` merges each loan category's lines with its manual bills
  (empty by construction). Only manual bills go through `match`. Loan
  lines arrive with their state already set, and their outflows aren't
  offered to manual bills, because a loan category has none.
- `paid_count`, `due_to_date_cents` and `unpaid_cents` include loan
  lines, so the tile marker and per-day figure work as they are.
- `attention_bills` skips `source == "loan"`.

`loan_lines` costs three queries whatever the number of loans, and a
test pins that. `sync_loans` on the Budgets page still costs queries per
loan, as it already does on the Overview.

### Adopt and release, in a models-only module
`budgets/loan_categories.py` imports only `budgets.models` and
`accounts.models`, so `transactions/loans.py` can import it without a
cycle. It provides:
- `loan_categories()`: the ids of categories that are the payment
  category of a loan on an active account.
- `adopt(category)`: deletes the category's limits, yearly rows and
  bills, and sets `budget_kind = bills`.
- `release(category)`: when no loan on an active account still pays into
  the category, sets `budget_kind = monthly`. The category had no limits,
  so it now has no budget.

`set_up_loan` adopts the new category. `edit_loan` adopts a new category
and releases the old one when the category changed. `remove_loan`
releases its category. All of this runs inside their existing atomic
blocks.

Archiving a loan account doesn't release. Its category simply stops
being a loan category, so `loan_categories()` drops it and it becomes
editable again, as a Bills category without bills. That's acceptable:
the user can switch its kind.

### Guards
`set_budget`, `set_limit` and `set_bills` return 400 for a category in
`loan_categories()`, with "Its loans set this budget. Change it on the
loan."

`CategorySerializer.loans` returns `[{account_id, name}]` for loans on
active accounts, prefetched with `Loan.objects.filter(payment_category__in=…)`
in the viewset, so the list costs one query.

### Budgets page syncs loans
`BudgetSummaryView.get` calls `sync_loans(today)` first, as the overview
does, so a payment that just arrived shows as paid.

### Frontend
- `CategoryCombobox`: when `c.loans?.length`, it adds a trailing
  `Landmark h-3.5 w-3.5 text-ink-muted` icon with the title "Budget set
  by loans: A, B".
- `LoanSchedulePage` `LoanForm`, below the payment category field, uses a
  pure `paymentCategoryNote(category, loan, categoriesById)` in
  `lib/loans.js` that returns `{tone, text}` or null:
  - A warning when the chosen category has a monthly default, overrides, a
    yearly budget or bills, and isn't already a loan category:
    "Mortgage's €1,400 monthly budget will be replaced by this loan's
    payment." For other budgets it names them: "Mortgage's yearly budget
    …", "Mortgage's 3 bills …".
  - A muted note when the category already follows other loans: "Joins
    House A in Mortgage's bills."
  - A muted note when the category is cleared or changed and this loan
    was the old category's only loan: "Mortgage goes back to no budget."
- `BudgetEditor`: when `category.loans?.length`, it renders only "Set by
  2 loans: House A, House B. Change it on the loan pages." Each name
  links to `/transactions/<id>/schedule`. There's no form and no Save.
- `BudgetSheet` `BillList`: a line with `source === "loan"` shows
  `Landmark` after its name and links the name to its schedule.
- Red for missed:
  - `LoanSchedulePage`: the "Missed" state uses `text-critical` instead of
    `text-warning`.
  - `OverviewPage` `missedLoanItem`: the icon becomes `text-critical`,
    with `tone: "text-critical"`.

## Risks / Trade-offs

- [An installment paid across the month boundary: matched, and so paid,
  in its own month, while the spending lands in the next month, which
  looks over] → The same accepted limitation as manual bills. Loans
  match within ±5 days, so only installments on the first or last days
  of a month are affected.
- [Adopting deletes a budget the user may want back] → It is warned about
  before saving. Releasing deliberately doesn't restore it.
- [Existing loans already have payment categories with limits] → Nothing
  changes until a loan is saved, because adopt runs on save. To keep
  data consistent, a data migration adopts every current payment category
  once, so existing mortgages switch without a re-save. It is
  reversible: release puts the categories back to monthly without limits.
- [The Budgets page now writes on GET (`sync_loans`)] → It's the same
  pattern the Overview already uses, and idempotent.

## Migration Plan

One data migration in `budgets` (it depends on the latest `accounts` and
`budgets` migrations): for each distinct `payment_category` of a loan on
an active account, delete its limits, yearly rows and bills, and set
`budget_kind = "bills"`. The reverse sets those categories back to
`monthly`. No schema change.

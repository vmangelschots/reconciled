# Design

## Context

A category's budget lives in three tables keyed on the category:
`CategoryLimit` (monthly default with `month=NULL`, plus per-month
overrides), `YearlyBudget` (one row per year the values changed) and `Bill`
(with `from_month`/`until_month`). `Category.budget_kind` picks which one
applies. `summary.has_budget` treats the yearly kinds as always having a
budget, and a monthly/Bills category as having one only when it has a limit
or bills in the month. So "No budget" is reachable only as monthly-without-
limits (or Bills-without-bills).

`CategoryViewSet.set_budget` (PUT `.../budget/`) already deletes the other
kinds' rows when switching, and the editor's `droppedSentence` already
writes the "what will be removed" text for the switch dialog.

## Goals / Non-Goals

**Goals:**
- One request that returns a category to the state of a new category.
- Reuse the switch dialog's wording and pattern for the removal dialog.

**Non-Goals:**
- Keeping past months' figures after removal (no soft delete, no
  `until_month` on monthly limits).
- Bulk removal from the category settings page.

## Decisions

**Removal deletes everything and resets the kind to monthly.** The removed
budget's history goes too, as it already does when switching kinds. The
alternative (end the budget from the viewed month on, keeping earlier
months) would need history on monthly limits, which they don't have, and
would make "remove" behave differently per kind. Resetting to monthly is
required anyway: a yearly kind always counts as budgeted.

**HTTP shape: DELETE on the existing actions.** `DELETE .../budget/`
removes the whole budget; `DELETE .../limit/?month=YYYY-MM` removes one
override. Both return the updated category like the PUTs do. They reuse
the PUTs' guards (tab, loan category → 400 with the same messages).
`DELETE .../limit/` without a month is rejected with 400 (removing just the
default is out of scope); a month without an override gives 404. Done in
one `transaction.atomic()`.

**The editor decides when to offer the actions.** Remove budget shows when
`budget_kind !== "monthly"`, or `monthly_limits.default_cents != null`, or
`monthly_limits.override_count > 0`, all already in the category payload.
Use default shows for a monthly category when the summary row says
`overridden`; the sheet passes `row.overridden` and the default (from
`category.monthly_limits.default_cents`) into the editor. The dialog text
comes from a sibling of `droppedSentence` ("The €400.00 monthly limit and
1 month override will be removed. Groceries will have no budget, in this
month and every other."), sharing its part-building so the two can't
drift.

**Closing and toast.** The editor calls `onSaved(id, kindChanged, message)`;
`handleBudgetSaved` uses the message when given, else "Budget updated.", so
removal reads "Groceries has no budget now." and Use default reads
"Groceries is back to €400 for December." (or "Groceries has no limit in
December." without a default, where the action reads "Remove December's
limit"). After a removal the "No budget" group opens when the highlighted
row is in it.

**The dialog is built from the saved category.** `budgetParts(category)`
lists what the saved budget holds; both the switch dialog and the removal
dialog use it, so a half-edited form never changes what the dialog says.
With nothing to list, the removal dialog still says the category will have
no budget. Subcategories with a budget of their own (from the `categories`
list the sheet already has, using the same "has a budget" test) are named
as keeping it.

**Remove budget in a Bills sheet sits in the Bills header.** Next to Edit
bills, as a quiet text button that opens the same dialog. The editor's
footer keeps it too, so it is in the same place for every kind once
editing.

**Undo is a toast action.** `toast.success(message, { action: { label,
onClick } })` renders a small text button in the toast (Radix's
`ToastPrimitive.Action`); other callers are unchanged. Undo after Use
default re-PUTs the month's old amount with `setCategoryLimit` and reloads.
Remove budget gets no Undo: its dialog is the safeguard, and restoring
yearly history and bills would need a restore payload.

**"This month only" follows the month.** The checkbox starts at
`overridden`, so a month with its own limit is edited as that month. With
it ticked the "<Month> only · Use default" line explains the state.

**Zero hint.** A monthly amount of exactly 0 shows a muted line under the
amount; it does not block saving, since a zero limit is valid.

**Forecast refusal.** `forecasting/expected.py`'s message becomes "This
category's budget is already in the forecast. Remove its budget to expect
it instead."

## Risks / Trade-offs

- [History is lost on removal] → The confirmation dialog says what goes,
  and the yearly case names "its yearly amount and history".
- [A removed parent budget changes how its subcategories read] → Expected
  behavior per the existing parent/group requirement; no special handling.

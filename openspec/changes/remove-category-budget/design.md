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
comes from a sibling of `droppedSentence` ("Removing Groceries's budget
removes the €400 monthly limit and 1 month override."), sharing its
part-building so the two can't drift.

**Closing and toast.** The editor calls `onSaved(id, kindChanged, message)`;
`handleBudgetSaved` uses the message when given, else "Budget updated.", so
removal reads "Groceries has no budget now." and Use default reads
"December uses the default for Groceries again.". In a Bills sheet the
action lives in the editor shown by Edit bills, so no new control is
needed in the bill list.

## Risks / Trade-offs

- [History is lost on removal] → The confirmation dialog says what goes,
  and the yearly case names "its yearly amount and history".
- [A removed parent budget changes how its subcategories read] → Expected
  behavior per the existing parent/group requirement; no special handling.

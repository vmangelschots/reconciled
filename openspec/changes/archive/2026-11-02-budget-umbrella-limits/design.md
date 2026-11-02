# Design

## Context

See proposal.md for motivation. `budget_rows` in `backend/budgets/summary.py`
feeds both the Budgets summary and the Overview, and returns one independent
row per monthly category. `backend/reports/views.py` builds the tile's totals
from those rows inline, and `yearly_spent_cents` sums every yearly category.
`yearly_rows` counts each yearly category's own spending. Categories are at
most two levels deep. All figures are calculated when viewed.

## Goals / Non-Goals

**Goals:**
- One rule, with no exceptions per kind: a parent's budget covers everything
  under it.
- Each euro in exactly one of budget total, outside budgets, yearly line or
  uncategorized.
- The Budgets page and the Overview can't disagree on totals.

**Non-Goals:**
- The redesign. Today's two tables stay, with small label changes. A parent
  without a budget keeps showing only its own spending; showing a group total
  is left to `budget-overview-redesign`.
- Preventing mixed kinds, or any UI aimed at them. They follow the same rule.
- Validating that caps fit within the parent. The summary only notes it.

## Decisions

**Spending belongs to the budget that covers it.** A category's owner is its
parent when the parent has a budget, otherwise itself. A parent has a budget
when it has a monthly limit for the viewed month, or is of a yearly kind. The
owner's kind decides where the month's spending counts: a monthly owner in
the budget total, no limit in outside budgets, a yearly kind on the yearly
line. Alternative: keep each subcategory's own kind deciding, with monthly
parents rolling up monthly subcategories only. Rejected, because it needs a
rule per kind and the user sees a parent's budget as covering everything.

**Roll up in `budget_rows` and `yearly_rows`.** A row's `spent_cents` becomes
the amount compared to its limit, so `remaining_cents`, `over_limit`,
`_attention_categories` and the frontend's existing fields follow without
changes. Rows gain `covers_subcategories` (a parent whose figures include
subcategories), `covered_by_parent` and `caps_cents` (a parent's subcategory
caps added up, for the note). The rollup needs spending of all subcategories,
so the spending queries widen from the row's own categories to all budgeted
categories in the period. Still one grouped query, then a dictionary sum.

**Shared totals in `summary.py`.** `budget_totals(rows)` returns `has_limits`,
`limit_cents`, `spent_cents` and `outside_cents`, and the Overview uses it
instead of its inline sums. Totals skip rows with `covered_by_parent`, which is
what stops caps and rolled-up spending counting twice. `yearly_spent_cents`
stays a separate function, moved next to it and taking owners into account,
because it needs spending in categories that have no monthly row. Both pages
call it. Alternative: compute in React. Rejected, as two sources are how the
pages would drift.

**Warnings stay per limit.** When parent and cap are both over, both are
listed, since they are two different limits. The overlap is rare and hiding
either needs a rule of its own.

**A yearly parent covers its subcategories even in a year it has no figures.**
Whether a yearly parent counts is decided by its kind alone, so a month before
the start month doesn't change where spending lands. Monthly figures aren't
affected by the start month, and neither is this.

**List subcategories whose parent isn't in the rows.** `buildCategoryTree`
drops a row whose parent is missing, which hides a monthly subcategory under
a yearly parent in today's monthly summary. The summary should keep such rows
at the top level with a "Parent / Sub" name, as `treeOrder` and `yearlyTree`
already do.

## Risks / Trade-offs

- [Past months change, and may newly show as over] → Accepted: there is one
  rule rather than history by date. Call it out in the PR.
- [Households with limits on both levels see totals drop and new warnings] →
  Accepted. Today's total for them is wrong.
- [A one-off yearly bill can push a monthly parent over] → Accepted by the
  user. Such bills can sit under a parent without a budget.
- [Tests assert the old independent figures] → Update those with the rule,
  in the same task group.

## Migration Plan

No schema or data migration. Rolling back the code restores the old figures.

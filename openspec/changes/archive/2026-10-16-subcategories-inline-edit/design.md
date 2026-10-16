# Design

## Context

`budgets.Category` is currently flat (`name`, globally unique, no
hierarchy). `budgets.views.CategoryViewSet` is a full `ModelViewSet` with
a `destroy()` override blocking deletion while transactions are assigned;
`BudgetSummaryView` computes each category's spend/limit independently
with no notion of grouping. The transaction ledger (`TransactionsPage`)
currently edits category only via a plain Radix `Select` inside the
row's full edit form. See `proposal.md` - Why for the two tightly-coupled
asks (fast inline recategorization; a light category hierarchy) and the
two decisions already made by the user (no rollup; inline quick-create
allowed).

## Goals / Non-Goals

**Goals:**
- Exactly two category levels, enforced server-side (not just hidden by
  the UI never offering a third level).
- Changing a transaction's category from the ledger takes one click plus
  a selection - no opening the full edit form.
- Creating a brand-new category from that same control, with no page
  switch.
- Keep the summary endpoint's actual spend/limit math completely
  unchanged - subcategories are a *display* grouping per the user's
  explicit choice, not a new aggregation.

**Non-Goals:**
- No way to create a *subcategory* from the inline ledger control - it
  only creates top-level categories. Creating under a parent still goes
  through the Budgets page. (Stated plainly in `proposal.md`, not a
  silent gap.)
- No rollup/aggregation of a parent's figures from its subcategories' -
  explicitly ruled out by the user.
- No bulk re-parenting or bulk move of a category's transactions when
  re-parenting - re-parenting only changes where a category sits in the
  tree, never touches its own transactions.
- No change to `CategoryLimit` or its set-limit endpoint - a
  subcategory's limit is set exactly the same way a top-level category's
  already is, no new code path needed there.

## Decisions

### `Category.parent`: a nullable self-FK, validated to one level
```python
parent = models.ForeignKey(
    "self", null=True, blank=True, on_delete=models.CASCADE, related_name="subcategories"
)
```
`on_delete=CASCADE` would silently delete subcategories with their
parent - but the spec requires blocking that deletion first (see below),
so CASCADE here is a backstop that should never actually fire via the
API; it's correct behavior if a parent is ever removed by another route
(e.g. direct DB access), consistent with "a subcategory can't outlive a
parent that doesn't exist."

Two-level enforcement lives in the serializer, not the model layer alone:
`validate_parent` rejects a parent that itself has a non-null `parent_id`
("cannot nest under a subcategory"), and rejects setting a category as
its own parent. Model-level `clean()` mirrors the same check as a second
line of defense for non-API writes (e.g. the Django admin).

### Uniqueness: partial unique constraints, same pattern as `CategoryLimit`
Replacing `name = CharField(unique=True)` with two partial unique
constraints - the exact mechanism already used for `CategoryLimit`'s
default-vs-override limits, since the underlying problem is identical
(SQL treats every NULL as distinct, so a plain `unique_together` on
`(parent, name)` would let unlimited top-level categories share a name):
```python
constraints = [
    models.UniqueConstraint(
        fields=["name"], condition=models.Q(parent__isnull=True),
        name="unique_top_level_category_name",
    ),
    models.UniqueConstraint(
        fields=["parent", "name"], condition=models.Q(parent__isnull=False),
        name="unique_subcategory_name_per_parent",
    ),
]
```

### Delete guard extended, not replaced
`CategoryViewSet.destroy()` already blocks deletion while
`category.transactions.exists()`. Add the same shape of check for
`category.subcategories.exists()` first (checking subcategories before
transactions reads slightly more naturally - "remove what's nested in
you before what's attached to you" - but either order satisfies the
spec, which doesn't say which check wins when both apply).

### Summary endpoint: unchanged math, one new field
`BudgetSummaryView` keeps computing `spent_cents`/`limit_cents` exactly
as today, per category, with zero awareness of hierarchy in the
calculation. The only addition is `parent_id` in each category's response
row, so the frontend can group for display. Grouping and indentation are
entirely a frontend concern - this is the most direct way to guarantee
the "independent figures" decision by construction: the aggregation code
path simply doesn't exist, so there's nothing to accidentally sum.

### Category list ordering: unchanged (flat, alphabetical); frontend builds the tree
`GET /api/categories/` keeps its existing flat `ordering = ["name"]`.
Both places that need a parent/child tree for display (`BudgetsPage`'s
category list and summary table, and the combobox's grouped results)
build it client-side from the flat list plus each row's `parent_id` -
cheap at the category counts a personal budgeting app has (dozens, not
thousands), and keeps the backend simple.

### The combobox: a new small component, reused in two places
Radix has no combobox/autocomplete primitive. `cmdk` (the library
shadcn/ui's own Combobox recipe is built on, itself built on Radix's
Popover underneath) adds exactly the missing piece - type-to-filter, a
list of results, keyboard navigation - without a heavier
autocomplete/search library. One new dependency, new `CategoryCombobox`
component:
- **On the ledger's category cell** (`allowCreate` on): filters the
  already-fetched category list by substring match on name (and, for a
  subcategory, on "parent / name" so searching "Groceries" surfaces its
  subcategories too); when nothing matches, shows "Create '<typed
  text>'" - selecting it calls the existing `createCategory` then
  `updateTransaction` in sequence (no new backend endpoint needed for
  this - both calls already exist).
- **On the Budgets page's parent-category picker** (`allowCreate` off):
  same filtering, but the candidate list is restricted to top-level
  categories only (categories with `parent_id === null`), since those
  are the only valid parents - and a "No parent (top-level)" option to
  clear an existing parent.

### Scope boundary: only the ledger's per-row cell changes interaction
The existing full row-edit form's category field and the ledger's
filter-by-category dropdown both stay plain `Select`s, unchanged. Per
`proposal.md`, "directly on the table" is specifically the per-row
display cell, not every place a category is ever picked.

## Risks / Trade-offs

- [A new dependency (`cmdk`) for one UI pattern] → Justified by being
  the standard, purpose-built library for exactly this (it's what the
  official shadcn/ui Combobox recipe itself uses) - building a
  typeahead-with-keyboard-nav popover by hand would be more code, not
  less, for a worse result.
- [Client-side tree-building in two separate places (Budgets page,
  combobox) instead of one shared backend response shape] → Both already
  fetch the same flat category list via the same existing endpoint; a
  tiny shared `buildCategoryTree(categories)` helper in the frontend
  avoids duplicating the grouping logic itself, without needing the
  backend to change its response shape.
- [Inline quick-create only makes top-level categories, which could
  surprise a user who expected it to ask "under which parent?"] →
  Deliberate, stated Non-Goal; the one extra click to the Budgets page
  to re-parent a freshly-created category is an acceptable cost for
  keeping the quick-create flow genuinely quick (no parent-picker
  interrupting it).

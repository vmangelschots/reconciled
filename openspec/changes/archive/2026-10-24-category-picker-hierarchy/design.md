# Design

## Context

- `CategoryCombobox` builds its options in `optionsFor(q)`:
  - `ranked = rankCategories(offered non-tab categories, categoriesById, query)`;
  - on an empty query `rankCategories` returns the list unchanged, which is
    the API's order, `Category.Meta.ordering = ["name"]` (own name only);
  - each option renders `categoryDisplayLabel` ("Parent / Child").
- Highlighting is controlled (`highlighted` state, `highlightFor`), and
  cmdk moves the highlight in DOM order. So the visible order is the
  keyboard order as long as options render in that order.
- `lib/categoryTree.js` already has `buildCategoryTree(categories)`: the
  top level alphabetical, each parent followed by its own subcategories
  alphabetical. The Budgets page uses it.
- Tabs (is_tab) and transfer targets already render as separate
  `CommandGroup`s after the categories.

## Goals / Non-Goals

**Goals:**
- A browsable tree with no new state: same values, same callbacks, same
  highlight logic.

**Non-Goals:**
- No collapsing, no reordering by hand, no change to matching or ranking.

## Decisions

### Order: `buildCategoryTree` on an empty search, ranking otherwise

When the query is empty, `ranked` becomes the flattened tree:
`buildCategoryTree(offered).flatMap(p => [p, ...p.subcategories])`, with a
`depth` (0 or 1) per option.
- A subcategory whose parent isn't offered is shown at depth 0 with its
  "Parent / " label, so nothing disappears. The Budgets parent picker,
  for example, passes top-level categories only.
- When the query is non-empty, `rankCategories` runs unchanged on the
  flattened tree order. Ties within a rank group therefore follow the
  tree rather than the API order, which keeps children near their parent
  in results too.
- `highlightFor` needs no change. On an empty search it highlights the
  current value or "no category"; on a non-empty one, `ranked[0]`.

Alternative considered: cmdk `CommandGroup`s per parent. Rejected,
because group headings aren't selectable, and parents must stay
pickable.

### Rendering

- **Depth 0:** the category's name, `text-ink-primary`. A parent with
  children gets `font-medium`, so it reads as a heading while staying an
  option.
- **Depth 1 (tree):** the own name, indented `pl-7` behind a 1px
  `border-l border-border` guide aligned with the parent's text, in
  `text-ink-secondary`, turning `text-ink-primary` when highlighted.
- **Search results, subcategory:** `<name>` followed by a muted
  `text-xs text-ink-muted` parent name, right-aligned in the row, so the
  name stays the first thing read.
- The check mark for the current value keeps its slot on the left at
  every depth.
- `CommandList` goes from `max-h-56` to `max-h-80` (about 10 rows).

### Labels elsewhere stay "Parent / Child"

The trigger (`categoryDisplayLabel`), the filter label and the review
groups don't change. Only the open list changes.

## Risks / Trade-offs

- [Tests assert the old empty-search order or option text "Food /
  Lunch".] → Update those assertions. Accessible names change from
  "Food / Lunch" to "Lunch Food" (name plus hint). Where a test needs
  the full label, give the option an `aria-label` of
  "Parent / Child", which also keeps screen-reader output unambiguous.
- [A long list of parents with many children gets longer to scroll.] →
  Typing is still the fast path, and the taller list shows more at once.

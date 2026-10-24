# Proposal

## Why

With an empty search, the category picker lists categories in the order
the API returns them: alphabetical by each category's own name. A
subcategory therefore lands far from its parent. "Food / Lunch" sits
among the L's, "Groceries / Supermarket" among the S's. Browsing the list
feels haphazard, even though tabs and transfers already read well because
they are grouped. The two-level hierarchy is already there; the picker
just doesn't show it.

## What Changes

- **An empty search shows the categories as a tree:**
  - top-level categories alphabetical;
  - each one followed by its own subcategories, alphabetical and
    indented, by their own name ("Lunch", not "Food / Lunch");
  - parents stay selectable, since transactions can be assigned to a
    parent itself.

  The "no category" option stays first; tabs and transfers stay in their
  own groups after the categories.
- **Search keeps today's matching and ranking:** the "Parent / " label is
  matched, and prefix matches come first. A matching subcategory reads as
  its own name with its parent shown muted beside it ("Lunch · Food"),
  so a match is always recognisable without the long "Food / Lunch"
  label.
- **The arrow keys follow the visible order,** so moving down the tree
  goes parent, its children, then the next parent.
- **The list is taller** (about ten rows instead of seven), so a parent
  and its children usually fit without scrolling.
- **The closed picker** (the ledger cell, the form field) keeps showing
  "Parent / Child".

Not in scope:
- Collapsing or expanding parents in the picker.
- Reordering categories by hand, or category icons and colours.
- The Budgets page's own category list.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `category-picker`: an empty search lists categories as a parent and
  children tree; search results show a subcategory's parent beside it;
  keyboard order follows the visible order.

## Impact

- **Frontend:**
  - `components/CategoryCombobox.jsx` renders the tree on an empty
    search and the parent hint on matches.
  - `lib/categoryTree.js` reuses `buildCategoryTree` for the order.
  - `CategoryCombobox.test.jsx` covers the new order, and page tests that
    rely on picker option text are adjusted.
- No backend change and no new dependencies.

# Design

## Context

`CategoryCombobox` is a Radix `Popover` wrapping a `cmdk` `Command` with
`shouldFilter={false}`. It filters by substring itself and renders the
clear item first, then the matches, then "Create". cmdk's highlight is
left uncontrolled. With custom filtering, cmdk keeps highlighting the
first rendered item, which is always the clear option. That's the
`groc` + Enter bug (see proposal.md, Why). The trigger is a plain
`<button>`, so only Enter and Space (a click) open the picker.

Three other places pick a category with the Radix `Select` wrapper
(`components/ui/Select`), with the `"uncategorized"` / `"all"` string
sentinels as values: `TransactionForm` and the filter bar in
`TransactionsPage.jsx`, and the recurring form in `ForecastingPage.jsx`.

## Goals / Non-Goals

**Goals:**
- One component carries all of the keyboard behavior from
  `specs/category-picker`. Pages only pass props.
- Keep the component's current props (`categories`, `value`,
  `onSelect`, `allowCreate`, `onCreate`, `clearLabel`, `placeholder`,
  `className`) and current mouse behavior.

**Non-Goals:**
- Inline ghost-text completion inside the input. A highlighted list row
  is the autocomplete, and Tab/Enter accept it.
- Virtualizing long category lists.

## Decisions

### Controlled highlight via cmdk `value`
Pass `value={highlighted}` and `onValueChange={setHighlighted}` to
`Command`, so arrow keys still move the highlight and we decide the
starting point. Recompute the highlight whenever the query changes, from
the same ranked list that's rendered:
- empty query → the selected category's id, or `"__clear__"`
- non-empty query → the first ranked item. If nothing matches,
  `"__create__"` when create is shown, otherwise nothing.

*Alternative considered:* letting cmdk filter (`shouldFilter` on) with a
custom `filter` scoring function. Rejected because cmdk's score-based
sort can't express "keep the original order within a group" cleanly, and
the existing comment explains why we filter ourselves.

### Ranking in a pure helper
Add `rankCategories(categories, categoriesById, query)` to
`lib/categoryTree.js`. It returns matches in groups: name starts with the
query, then label starts with it, then contains it, keeping the original
order within each group. The clear option is a separate check on
`clearLabel.toLowerCase().includes(q)` and is rendered after the matches.
Being a pure function, it can be unit-tested next to `categoryDisplayLabel`.

### Type-to-open on the trigger
Add an `onKeyDown` on the trigger. For a key with `key.length === 1` and
no Ctrl, Meta or Alt held, call `preventDefault`, set `query` to that key,
and open. Add ArrowDown → open. Enter and Space already open via click.
`CommandInput` gets `autoFocus` so typing continues in the search field.
Space counts as printable but already opens the picker through the
button's default, so leave it to the default.

### Tab handling and focus order
The content is portaled to `<body>`, so the browser's default Tab from
the search input would jump to the end of the document. Handle Tab in
the input's `onKeyDown` instead:
1. `preventDefault`.
2. If the highlighted item is a category or the clear option, call
   `onSelect` for it. If it's `"__create__"` or nothing, select nothing.
3. Record the direction (`next` or `prev`) in a ref and close.
4. In `PopoverContent`'s `onCloseAutoFocus`, if a direction is recorded,
   `preventDefault` and focus the tabbable element after (or before) the
   trigger. Otherwise let Radix return focus to the trigger, which covers
   Enter and Escape.

A small helper, `focusAdjacentTabbable(el, direction)` in `lib/`, lists
the document's tabbable elements (`a[href], button, input, select,
textarea, [tabindex]:not([tabindex="-1"])`, minus disabled and hidden
ones) and focuses the neighbor.

*Alternative considered:* not portaling the content, so the native Tab
order works. Rejected because the ledger cell sits inside a table that
can clip overflow, and Tab would still need intercepting to commit the
selection.

### Resetting the search on close
Move the reset into one wrapper around `onOpenChange`: when it closes,
clear `query` and the highlight. Escape, clicking outside, Enter and Tab
all go through it.

### Accessible name passthrough
Add an `"aria-label"` prop that's forwarded to the trigger, so the
replaced `Select`s keep their accessible names ("Category", "Filter by
category") and existing `getByLabelText` / `getByRole(..., { name })`
queries keep working.

### Migrating the three Select sites
Change their state from string sentinels to `id | null`. The forms
submit `category: value` directly. The filter keeps `null` for "All" and
sends `""` to the API, as `ALL_CATEGORIES` does now. Pass
`clearLabel`/`placeholder`: "Uncategorized" for the forms and "All" for
the filter. No `allowCreate`. Remove the `UNCATEGORIZED` /
`ALL_CATEGORIES` constants and `Select` imports once nothing uses them.

## Risks / Trade-offs

- [Tab inside the open picker no longer tabs between the input and the
  list] → the list is navigated with the arrow keys anyway, the same
  pattern as the ARIA combobox.
- [Changing the highlight while the user is mid-arrow-navigation] → we
  only recompute when `query` changes, never on re-render, so arrowing
  isn't overridden.
- [The tabbable helper misses an exotic focus target] → the app only
  uses buttons, inputs and links. Covered by page-level tests that Tab
  out of a picker.
- [jsdom and cmdk in tests] → `src/test/setup.js` already polyfills
  `scrollIntoView` and `ResizeObserver`. `userEvent.keyboard` drives the
  key flows.

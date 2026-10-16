# Tasks

## 1. Category hierarchy (backend model)

- [x] 1.1 Add `Category.parent` (nullable self-FK, `related_name="subcategories"`) and replace the `unique=True` on `name` with the two partial unique constraints (top-level name uniqueness; per-parent subcategory name uniqueness), and verify the migration applies and reverses cleanly
- [x] 1.2 Add `CategorySerializer.validate_parent` (reject a parent that itself has a parent; reject a category being set as its own parent) and a matching `Category.clean()` as a second line of defense for non-API writes, and verify tests for the budgets spec scenarios: create a subcategory, reject nesting a subcategory under a subcategory, reject self-parenting (found and fixed along the way: DRF doesn't auto-generate a UniqueValidator from conditional `Meta.constraints` the way it does from field-level `unique=True`, so a duplicate name was hitting the database's IntegrityError directly as a raw 500 - added an explicit per-level uniqueness check in `validate()`)
- [x] 1.3 Verify tests for the spec's uniqueness scenarios: two top-level categories can't share a name, two subcategories under the *same* parent can't share a name, but two subcategories under *different* parents can share a name

## 2. Delete guard & summary endpoint

- [x] 2.1 Extend `CategoryViewSet.destroy()` to also block deletion while `category.subcategories.exists()`, naming the blocker in the response, and verify tests: deleting a category with subcategories is blocked, and succeeds once they're deleted or re-parented away
- [x] 2.2 Add `parent_id` to each category row in `BudgetSummaryView`'s response, with no change to the spend/limit calculation itself, and verify a test replaying the spec's rollup scenario: a parent with its own direct spend and a subcategory with its own direct spend both appear independently, parent's total is not increased by the subcategory's

## 3. Shared category combobox (frontend)

- [ ] 3.1 Add `cmdk` as a dependency and build `CategoryCombobox` (props: `categories`, `value`, `onSelect`, `allowCreate`, `onCreate`) - filters by substring match on name, and for subcategories on "parent / name" too, so searching a parent's name surfaces its children - and verify a component test: typing narrows the visible options to matches only
- [ ] 3.2 Add the `allowCreate` path: when nothing matches the typed text, show a "Create '<text>'" option whose selection calls `onCreate` instead of `onSelect`, and verify a component test: typing a non-matching name shows the create option, and omitting `allowCreate` never shows it regardless of match state
- [ ] 3.3 Add a `buildCategoryTree(categories)` helper (groups subcategories under their parent, keeps top-level categories ordered alphabetically) shared by this component and the Budgets page, and verify a test with a mixed flat list produces the expected grouped structure

## 4. Wire into the transaction ledger

- [ ] 4.1 Replace the ledger row's static category text with `CategoryCombobox` (`allowCreate` on), committing a selection immediately via the existing `updateTransaction` call with no separate save step, and verify manually that selecting an existing category reassigns the transaction without opening the row's full edit form
- [ ] 4.2 Wire the create-on-the-spot path: selecting "Create '<name>'" calls `createCategory` then `updateTransaction` with the new category's id, and verify manually that a brand-new top-level category is created and assigned to that transaction in one action, and that it's immediately available (no extra reload step) in that category list for other rows

## 5. Wire into the Budgets page

- [ ] 5.1 Add a parent-category field (`CategoryCombobox`, `allowCreate` off, candidates restricted to top-level categories, plus a "No parent" option) to the category create/edit form, and verify manually that creating a subcategory and re-parenting an existing category both work
- [ ] 5.2 Indent subcategories under their parent in both the category management list and the monthly summary table (using `buildCategoryTree`), and verify manually that the summary table's figures match task 2.2's independent-figures behavior visually, not just in the API response

## 6. End-to-end verification against the real running stack

- [ ] 6.1 Verify a full live-stack pass: create a top-level category and a subcategory under it via the Budgets page, confirm the delete guard blocks removing the parent while the subcategory exists, set independent limits on both and confirm the summary shows them ungrouped-in-value but grouped-in-display, then on the Transactions page inline-reassign an existing transaction's category via the combobox and create a brand-new category on the spot from that same control - all against real data, cleaned up afterward

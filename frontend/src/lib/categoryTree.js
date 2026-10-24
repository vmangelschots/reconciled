// Shared by CategoryCombobox and BudgetsPage - groups a flat category
// list (each row carrying parent/parent_id) into top-level categories
// each followed by their own subcategories, alphabetical at both
// levels. Pure display grouping - never changes what a category's
// figures are, per design.md's "no rollup" decision.
export function buildCategoryTree(categories) {
  const getParentId = (c) => (c.parent_id !== undefined ? c.parent_id : c.parent);
  const topLevel = categories
    .filter((c) => getParentId(c) == null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return topLevel.map((parent) => ({
    ...parent,
    subcategories: categories
      .filter((c) => getParentId(c) === parent.id)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export function categoryDisplayLabel(category, categoriesById) {
  const parentId = category.parent_id !== undefined ? category.parent_id : category.parent;
  if (parentId != null) {
    const parent = categoriesById[parentId];
    return parent ? `${parent.name} / ${category.name}` : category.name;
  }
  return category.name;
}

// Orders the categories matching `query` for the picker: own name
// starts with the query, then the "Parent / name" label starts with it,
// then the label merely contains it. Original order is kept within each
// group so callers control the tie-break. An empty query returns the
// list unchanged.
export function rankCategories(categories, categoriesById, query) {
  const q = query.trim().toLowerCase();
  if (!q) return categories;
  const groups = [[], [], []];
  for (const c of categories) {
    const label = categoryDisplayLabel(c, categoriesById).toLowerCase();
    if (c.name.toLowerCase().startsWith(q)) groups[0].push(c);
    else if (label.startsWith(q)) groups[1].push(c);
    else if (label.includes(q)) groups[2].push(c);
  }
  return groups.flat();
}

// The picker's order: each top-level category followed by its own
// subcategories, alphabetical at both levels, as [{ category, depth }].
// A subcategory whose parent isn't in the list stays at depth 0 (it is
// shown with its "Parent / " label), so nothing disappears - e.g. the
// Budgets parent-picker passes top-level categories only.
export function treeOrder(categories) {
  const getParentId = (c) => (c.parent_id !== undefined ? c.parent_id : c.parent);
  const ids = new Set(categories.map((c) => c.id));
  const byName = (a, b) => a.name.localeCompare(b.name);
  const roots = categories.filter((c) => getParentId(c) == null || !ids.has(getParentId(c))).sort(byName);
  return roots.flatMap((root) => [
    { category: root, depth: 0 },
    ...(getParentId(root) == null
      ? categories
          .filter((c) => getParentId(c) === root.id)
          .sort(byName)
          .map((category) => ({ category, depth: 1 }))
      : []),
  ]);
}

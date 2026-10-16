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

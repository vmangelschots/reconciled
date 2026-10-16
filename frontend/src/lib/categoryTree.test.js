import { describe, expect, it } from "vitest";
import { buildCategoryTree, categoryDisplayLabel, rankCategories } from "./categoryTree";

describe("buildCategoryTree", () => {
  it("groups subcategories under their parent, alphabetical at both levels", () => {
    const flat = [
      { id: 1, name: "Groceries", parent_id: null },
      { id: 2, name: "Transport", parent_id: null },
      { id: 3, name: "Takeout", parent_id: 1 },
      { id: 4, name: "Supermarket", parent_id: 1 },
      { id: 5, name: "Fuel", parent_id: 2 },
    ];

    const tree = buildCategoryTree(flat);

    expect(tree.map((c) => c.name)).toEqual(["Groceries", "Transport"]);
    expect(tree[0].subcategories.map((c) => c.name)).toEqual(["Supermarket", "Takeout"]);
    expect(tree[1].subcategories.map((c) => c.name)).toEqual(["Fuel"]);
  });

  it("handles a flat list with no subcategories", () => {
    const flat = [
      { id: 1, name: "Groceries", parent_id: null },
      { id: 2, name: "Transport", parent_id: null },
    ];
    const tree = buildCategoryTree(flat);
    expect(tree.every((c) => c.subcategories.length === 0)).toBe(true);
  });

  it("also works with the CategorySerializer's 'parent' field name", () => {
    const flat = [
      { id: 1, name: "Groceries", parent: null },
      { id: 2, name: "Supermarket", parent: 1 },
    ];
    const tree = buildCategoryTree(flat);
    expect(tree[0].subcategories.map((c) => c.name)).toEqual(["Supermarket"]);
  });
});

describe("categoryDisplayLabel", () => {
  it("shows a subcategory as 'Parent / Child'", () => {
    const groceries = { id: 1, name: "Groceries", parent_id: null };
    const supermarket = { id: 2, name: "Supermarket", parent_id: 1 };
    const byId = { 1: groceries, 2: supermarket };
    expect(categoryDisplayLabel(supermarket, byId)).toBe("Groceries / Supermarket");
  });

  it("shows a top-level category as just its own name", () => {
    const groceries = { id: 1, name: "Groceries", parent_id: null };
    expect(categoryDisplayLabel(groceries, { 1: groceries })).toBe("Groceries");
  });
});

describe("rankCategories", () => {
  const CATS = [
    { id: 1, name: "Oatmeal", parent_id: null },
    { id: 2, name: "Groceries", parent_id: null },
    { id: 3, name: "Meat", parent_id: 2 },
    { id: 4, name: "Meals", parent_id: null },
    { id: 5, name: "Takeout", parent_id: 4 },
    { id: 6, name: "Transport", parent_id: null },
  ];
  const byId = Object.fromEntries(CATS.map((c) => [c.id, c]));
  const ids = (list) => list.map((c) => c.id);

  it("returns the input order for an empty query", () => {
    expect(ids(rankCategories(CATS, byId, "  "))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("ranks name-prefix, then label-prefix, then substring matches", () => {
    // Meat and Meals start with "mea"; "Meals / Takeout" only by label;
    // Oatmeal only contains it.
    expect(ids(rankCategories(CATS, byId, "mea"))).toEqual([3, 4, 5, 1]);
  });

  it("matches case-insensitively", () => {
    expect(ids(rankCategories(CATS, byId, "MEA"))).toEqual([3, 4, 5, 1]);
  });

  it("keeps the original order within a group", () => {
    const reordered = [CATS[3], CATS[2]];
    expect(ids(rankCategories(reordered, byId, "mea"))).toEqual([4, 3]);
  });
});

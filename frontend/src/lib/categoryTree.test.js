import { describe, expect, it } from "vitest";
import { buildCategoryTree, categoryDisplayLabel } from "./categoryTree";

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

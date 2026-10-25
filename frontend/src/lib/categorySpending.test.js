import { describe, expect, it } from "vitest";
import { buildPieSlices, buildRows } from "./categorySpending";

// n categories spending 100.00, 90.00, 80.00, ... so the order is known.
function payload(n, uncategorized_cents = 0) {
  return {
    month: "2026-03",
    categories: Array.from({ length: n }, (_, i) => ({
      category_id: i + 1,
      name: `Cat ${i + 1}`,
      spent_cents: 10000 - i * 1000,
      direct_cents: 10000 - i * 1000,
      subcategories: [],
    })),
    uncategorized_cents,
  };
}

const names = (slices) => slices.map((s) => s.name);

describe("buildRows", () => {
  it("puts subcategories and the direct spending under their parent, largest first", () => {
    const rows = buildRows({
      month: "2026-03",
      categories: [
        {
          category_id: 1,
          name: "Groceries",
          spent_cents: 25000,
          direct_cents: 5000,
          subcategories: [{ category_id: 3, name: "Supermarket", spent_cents: 20000 }],
        },
      ],
      uncategorized_cents: 9000,
    });
    expect(names(rows)).toEqual(["Groceries", "Uncategorized"]);
    expect(names(rows[0].children)).toEqual(["Supermarket", "Groceries (direct)"]);
  });
});

describe("buildPieSlices", () => {
  it("groups the tail into Other after the six largest, with Uncategorized on its own", () => {
    const slices = buildPieSlices(buildRows(payload(9, 50000)));
    expect(names(slices)).toEqual(["Cat 1", "Cat 2", "Cat 3", "Cat 4", "Cat 5", "Cat 6", "Other", "Uncategorized"]);
    const other = slices[6];
    expect(other.cents).toBe(4000 + 3000 + 2000);
    expect(names(other.children)).toEqual(["Cat 7", "Cat 8", "Cat 9"]);
  });

  it("gives exactly seven categories a slice each, with no Other", () => {
    const slices = buildPieSlices(buildRows(payload(7)));
    expect(names(slices)).toEqual(["Cat 1", "Cat 2", "Cat 3", "Cat 4", "Cat 5", "Cat 6", "Cat 7"]);
  });

  it("never folds Uncategorized into Other, even when it is the smallest", () => {
    const slices = buildPieSlices(buildRows(payload(8, 100)));
    expect(names(slices)).toEqual(["Cat 1", "Cat 2", "Cat 3", "Cat 4", "Cat 5", "Cat 6", "Other", "Uncategorized"]);
    expect(names(slices[6].children)).toEqual(["Cat 7", "Cat 8"]);
  });

  it("is empty for a month without spending", () => {
    expect(buildPieSlices(buildRows(payload(0)))).toEqual([]);
  });
});

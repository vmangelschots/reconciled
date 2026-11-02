import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { budgetExtras, budgetList, perDayCents, verdict, yearlyWarning } from "./budgetOverview";
import { formatMoneyWhole as whole } from "./money";
import { formatDayMonth } from "./yearlyBudgets";

function monthly(id, name, fields = {}) {
  const limit = fields.limit_cents ?? null;
  const spent = fields.spent_cents ?? 0;
  return {
    category_id: id, category_name: name, parent_id: null, limit_cents: limit, spent_cents: spent,
    remaining_cents: limit == null ? null : limit - spent, over_limit: limit != null && spent > limit,
    covers_subcategories: false, covered_by_parent: false, caps_cents: null, group_spent_cents: null,
    overridden: false, ...fields,
  };
}

const CLOTHING = {
  category_id: 30, category_name: "Clothing", parent_id: null, kind: "yearly", amount_cents: 120000,
  budget_cents: 120000, prorated_from: null, spent_cents: 72000, remaining_cents: 48000, over: false, ahead: false,
  pace: 0.8, runway_cents: 16000, due_date: null, state: null, covers_subcategories: false, caps_cents: null,
};
const TAX = {
  category_id: 40, category_name: "Property tax", parent_id: null, kind: "target", amount_cents: 40000,
  budget_cents: 40000, prorated_from: null, spent_cents: 0, remaining_cents: 40000, over: false, ahead: false,
  pace: null, runway_cents: null, due_date: "2026-11-01", state: "due_soon", covers_subcategories: false, caps_cents: null,
};

function summary(categories = [], yearly = [], extra = {}) {
  return {
    categories,
    yearly: { year: 2026, through: "2026-10-24", start_month: null, starts: null, categories: yearly },
    pace: 0.77,
    attention: { categories: [], yearly: [] },
    totals: { has_limits: true, limit_cents: 91000, spent_cents: 78500, outside_cents: 3500, yearly_spent_cents: 13000, uncategorized_cents: 4200 },
    ...extra,
  };
}

const one = (s, name, categories = []) => {
  const { rows, noBudget } = budgetList(s, categories);
  return [...rows, ...noBudget.rows].find((r) => r.name === name);
};

describe("budgetList", () => {
  it("lists every kind in one tree, subcategories under their parent", () => {
    const s = summary(
      [monthly(1, "Car", { limit_cents: 30000, covers_subcategories: true }), monthly(2, "Fuel", { parent_id: 1, covered_by_parent: true }), monthly(3, "Aardvark", { limit_cents: 100 })],
      [{ ...CLOTHING, category_id: 4, category_name: "Repairs", parent_id: 1 }, { ...TAX, category_name: "Insurance", parent_id: 1 }, CLOTHING],
    );
    const { rows } = budgetList(s, [{ id: 1, name: "Car" }]);
    expect(rows.map((r) => [r.name, r.indent])).toEqual([
      ["Aardvark", false],
      ["Car", false],
      ["Fuel", true],
      ["Insurance", true],
      ["Repairs", true],
      ["Clothing", false],
    ]);
  });

  it("names a subcategory whose parent isn't listed", () => {
    const s = summary([monthly(2, "Parking", { parent_id: 9, limit_cents: 100 })]);
    expect(budgetList(s, [{ id: 9, name: "Holidays" }]).rows[0].name).toBe("Holidays / Parking");
  });

  it("keeps a row in place when it goes over", () => {
    const under = summary([monthly(1, "Apples", { limit_cents: 100 }), monthly(2, "Bananas", { limit_cents: 100 })]);
    const over = summary([monthly(1, "Apples", { limit_cents: 100, spent_cents: 900 }), monthly(2, "Bananas", { limit_cents: 100 })]);
    expect(budgetList(over, []).rows.map((r) => r.name)).toEqual(budgetList(under, []).rows.map((r) => r.name));
  });

  it("shows a category within its limit", () => {
    const row = one(summary([monthly(1, "Groceries", { limit_cents: 40000, spent_cents: 32000 })]), "Groceries");
    expect(row.figure).toBe(`${whole(8000)} left`);
    expect(row.caption).toBe(`${whole(32000)} of ${whole(40000)} a month`);
    expect(row.bar).toMatchObject({ value: 32000, max: 40000, marker: 0.77 });
  });

  it("shows a category over its limit", () => {
    const row = one(summary([monthly(1, "Groceries", { limit_cents: 40000, spent_cents: 43000 })]), "Groceries");
    expect(row.figure).toBe(`${whole(3000)} over`);
    expect(row.critical).toBe(true);
  });

  it("turns a monthly budget amber only when attention warns about it", () => {
    const rows = [monthly(1, "Utilities", { limit_cents: 20000, spent_cents: 18000 })];
    expect(one(summary(rows), "Utilities").bar.tone).toBeUndefined();
    const warned = summary(rows, [], { attention: { categories: [{ id: 1 }], yearly: [] } });
    expect(one(warned, "Utilities").bar.tone).toBe("warning");
  });

  it("marks a month override", () => {
    const row = one(summary([monthly(1, "Groceries", { limit_cents: 60000, overridden: true })]), "Groceries");
    expect(row.caption).toContain("this month only");
  });

  it("says a parent includes subcategories, and when caps exceed it", () => {
    const food = monthly(1, "Food", { limit_cents: 40000, covers_subcategories: true, caps_cents: 45000 });
    expect(one(summary([food]), "Food").caption).toContain(`includes subcategories, caps add up to ${whole(45000)}`);
    expect(one(summary([{ ...food, caps_cents: 10000 }]), "Food").caption).not.toContain("caps");
  });

  it("shows a yearly budget with its runway", () => {
    const row = one(summary([], [CLOTHING]), "Clothing");
    expect(row.figure).toBe(`${whole(48000)} left`);
    expect(row.caption).toBe(`${whole(72000)} of ${whole(120000)} a year · ${whole(16000)} a month to Dec`);
    expect(row.bar.marker).toBe(0.8);
  });

  it("shows a pro-rated budget", () => {
    const row = one(summary([], [{ ...CLOTHING, budget_cents: 30000, prorated_from: "2026-10-01", spent_cents: 0, remaining_cents: 30000 }]), "Clothing");
    expect(row.caption).toContain(`of ${whole(120000)} · from Oct`);
  });

  it("says how much a yearly budget is over", () => {
    const row = one(summary([], [{ ...CLOTHING, budget_cents: 30000, spent_cents: 33000, remaining_cents: -3000, over: true, runway_cents: null }]), "Clothing");
    expect(row.critical).toBe(true);
    expect(row.caption).toContain("€30 over for 2026");
  });

  it("turns a yearly bar amber when running ahead, and leaves the pace out of past months", () => {
    expect(one(summary([], [{ ...CLOTHING, ahead: true }]), "Clothing").bar.tone).toBe("warning");
    expect(one(summary([], [{ ...CLOTHING, pace: null, runway_cents: null }]), "Clothing").bar.marker).toBeNull();
  });

  it("shows a target due soon", () => {
    const row = one(summary([], [TAX]), "Property tax");
    expect(row.figure).toBe(`${whole(40000)} to pay`);
    expect(row.caption).toBe(`${whole(0)} of ${whole(40000)} · due ${formatDayMonth("2026-11-01")}, in 8 days`);
  });

  it.each([
    [{ state: "overdue" }, `overdue since ${formatDayMonth("2026-11-01")}`, true],
    [{ state: "not_seen" }, `due ${formatDayMonth("2026-11-01")}, not seen yet`, false],
    [{ state: "partly_paid", spent_cents: 30000, remaining_cents: 10000 }, "partly paid · €100 short", false],
  ])("labels a target %o", (fields, label, critical) => {
    const row = one(summary([], [{ ...TAX, ...fields }]), "Property tax");
    expect(row.caption).toContain(label);
    expect(Boolean(row.critical)).toBe(critical);
  });

  it("shows a paid target as paid, green past its amount", () => {
    const row = one(summary([], [{ ...TAX, state: "paid", spent_cents: 40500, remaining_cents: -500 }]), "Property tax");
    expect(row.figure).toBe("Paid");
    expect(row.bar.tone).toBe("positive");
    expect(row.caption).toContain("paid · €5 over");
  });

  it("shows a covered subcategory without a bar", () => {
    const s = summary([monthly(1, "Food", { limit_cents: 100000, covers_subcategories: true }), monthly(2, "Takeout", { parent_id: 1, spent_cents: 5000, covered_by_parent: true })]);
    const row = one(s, "Takeout", [{ id: 1, name: "Food" }]);
    expect(row.figure).toBe(`${whole(5000)} spent`);
    expect(row.caption).toBe("Covered by Food");
    expect(row.bar).toBeUndefined();
  });

  it("shows a parent without a budget as a group, with its total", () => {
    const s = summary([
      monthly(1, "Household", { spent_cents: 1000, group_spent_cents: 4000 }),
      monthly(2, "Cleaning", { parent_id: 1, limit_cents: 5000, spent_cents: 3000 }),
    ]);
    const { rows, noBudget } = budgetList(s, [{ id: 1, name: "Household" }]);
    expect(rows[0]).toMatchObject({ name: "Household", figure: `${whole(4000)} spent` });
    expect(rows[0].bar).toBeUndefined();
    expect(rows[1].bar).toBeDefined();
    expect(noBudget.count).toBe(0);
  });

  it("collapses categories with no budget", () => {
    const s = summary([
      monthly(1, "Gifts", { spent_cents: 3500 }),
      monthly(2, "Pets", { group_spent_cents: 200 }),
      monthly(3, "Vet", { parent_id: 2, spent_cents: 200 }),
      monthly(4, "Rent", { limit_cents: 100 }),
    ]);
    const { rows, noBudget } = budgetList(s, []);
    expect(rows.map((r) => r.name)).toEqual(["Rent"]);
    expect(noBudget).toMatchObject({ count: 2, spentCents: 3700 });
    expect(noBudget.rows.map((r) => r.name)).toEqual(["Gifts", "Pets", "Vet"]);
  });
});

describe("verdict", () => {
  const withAttention = (n) =>
    summary([], [], { attention: { categories: Array(n).fill({}), yearly: [] } });

  it("counts what needs a look in the current month", () => {
    expect(verdict(withAttention(2), "2026-10", "2026-10")).toBe("2 need a look");
    expect(verdict(withAttention(1), "2026-10", "2026-10")).toBe("1 needs a look");
    expect(verdict(withAttention(0), "2026-10", "2026-10")).toBe("On track");
  });

  it("says how a past month finished", () => {
    const over = summary([], [], { totals: { has_limits: true, limit_cents: 100000, spent_cents: 115000 } });
    expect(verdict(over, "2026-09", "2026-10")).toBe(`Finished ${whole(15000)} over`);
    const under = summary([], [], { totals: { has_limits: true, limit_cents: 100000, spent_cents: 90000 } });
    expect(verdict(under, "2026-09", "2026-10")).toBe(`Finished ${whole(10000)} under`);
  });

  it("has no verdict for a future month or without limits", () => {
    expect(verdict(withAttention(0), "2026-11", "2026-10")).toBeNull();
    const none = summary([], [], { totals: { has_limits: false, limit_cents: 0, spent_cents: 0 } });
    expect(verdict(none, "2026-10", "2026-10")).toBeNull();
  });
});

describe("headline wording", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 24));
  });
  afterEach(() => vi.useRealTimers());

  it("lists the rest of the month's spending like the overview", () => {
    expect(budgetExtras(summary().totals)).toEqual([
      `${whole(13000)} on yearly budgets`,
      `+${whole(3500)} outside budgets`,
      `${whole(4200)} uncategorized`,
    ]);
  });

  it("rounds the daily amount down to whole euros", () => {
    expect(perDayCents(12500, 8)).toBe(1500);
    expect(perDayCents(-100, 8)).toBeNull();
    expect(perDayCents(100, null)).toBeNull();
  });

  it("words a target due soon", () => {
    const { primary, upcoming } = yearlyWarning({ name: "Property tax", state: "due_soon", kind: "target", due_date: "2026-11-01", spent_cents: 0, budget_cents: 40000 }, "2026");
    expect(primary).toBe("Property tax due in 8 days");
    expect(upcoming).toBe(true);
  });
});

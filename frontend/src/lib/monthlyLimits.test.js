import { describe, expect, it } from "vitest";
import { defaultInEffect } from "./monthlyLimits";

const groceries = (defaults) => ({ monthly_limits: { default_cents: 65000, defaults, override_count: 0 } });

describe("defaultInEffect", () => {
  it("uses the latest default from the month or before", () => {
    const category = groceries([
      { from_month: null, limit_cents: 65000 },
      { from_month: "2027-07", limit_cents: 55000 },
    ]);
    expect(defaultInEffect(category, "2027-06")).toBe(65000);
    expect(defaultInEffect(category, "2027-07")).toBe(55000);
    expect(defaultInEffect(category, "2028-01")).toBe(55000);
  });

  it("uses the first default before it starts", () => {
    expect(defaultInEffect(groceries([{ from_month: "2027-07", limit_cents: 55000 }]), "2027-03")).toBe(55000);
  });

  it("has none without defaults", () => {
    expect(defaultInEffect(groceries([]), "2027-03")).toBeNull();
  });
});

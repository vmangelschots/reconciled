import { describe, expect, it } from "vitest";
import { actualHeader, changeLine, incomeCaption, leftLine, planCaption, removesPhrase } from "./yearPlans";

describe("year plan wording", () => {
  it("names the Actual column's range", () => {
    expect(actualHeader({ kind: "last_12", from: "2025-11-01", until: "2026-10-31" }, 2027)).toBe("Last 12 mo (Nov–Oct)");
    expect(actualHeader({ kind: "so_far", from: "2026-01-01", until: "2026-11-16" }, 2026)).toBe("So far");
  });

  it("says what a row plans", () => {
    expect(planCaption({ kind: "monthly", default_cents: 60000, exceptions: { 12: 80000 } })).toBe("€600 a month · 1 month differs");
    expect(planCaption({ kind: "target", due: "03-01" })).toBe("on 1 Mar");
    expect(planCaption({ kind: "bills", bills: [{}, {}] })).toBe("2 bills");
  });

  it("says what's left or short", () => {
    expect(leftLine({ left_cents: 370000 })).toBe("€3,700 left to save");
    expect(leftLine({ left_cents: -140000 })).toBe("€1,400 short");
  });

  it("says what a kind switch removes", () => {
    expect(removesPhrase({ defaults: 1, overrides: 3, yearly_years: 0, bills: 0 })).toBe("its monthly limits and 3 month overrides");
    expect(removesPhrase({ defaults: 0, overrides: 0, yearly_years: 0, bills: 0 })).toBeNull();
  });

  it("words the preview's changes", () => {
    expect(
      changeLine({
        category_name: "Holidays", kind_switch: { removes: { defaults: 1, overrides: 0, yearly_years: 0, bills: 0 } },
        to_kind: "yearly", to_cents: 300000, per: "year",
      }),
    ).toEqual({
      title: "Holidays becomes yearly €3,000",
      detail: "For every month, earlier ones included; its monthly limits go.",
      warning: true,
    });
    expect(changeLine({ category_name: "Groceries", from_cents: 65000, to_cents: 60000, per: "month", exceptions: null }))
      .toEqual({ title: "Groceries", detail: "€650\u2009→\u2009€600 a month", warning: false });
    expect(changeLine({ category_name: "Streaming", bills: { added: 1, ended: 0 }, from_cents: 1799, to_cents: 2798 }).title)
      .toBe("Streaming +1 bill");
  });

  it("words an income line", () => {
    expect(incomeCaption({ amount_cents: 320000, per: "month", extra: { 12: 320000, 5: 290000 } })).toBe("€3,200 a month + May, Dec");
  });
});

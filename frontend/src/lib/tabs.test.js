import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";
import { assignableCategories, isStale, tabSentence } from "./tabs";

describe("tabSentence", () => {
  it("says who owes whom, never with a sign", () => {
    expect(tabSentence("Jan", 3000)).toEqual({ text: `Jan owes you ${formatMoney(3000)}`, tone: "default" });
    expect(tabSentence("Jan", -500)).toEqual({ text: `You owe Jan ${formatMoney(500)}`, tone: "warning" });
    expect(tabSentence("Jan", 0)).toEqual({ text: "Settled", tone: "muted" });
  });
});

describe("isStale", () => {
  const today = new Date(2026, 9, 24); // 24 Oct

  it("turns after 30 days", () => {
    expect(isStale("2026-09-24", today)).toBe(false); // exactly 30 days
    expect(isStale("2026-09-23", today)).toBe(true);
    expect(isStale("2026-09-12", today)).toBe(true);
    expect(isStale("2026-10-20", today)).toBe(false);
  });

  it("is never stale while settled", () => {
    expect(isStale(null, today)).toBe(false);
  });
});

describe("assignableCategories", () => {
  it("drops tab groups but keeps their tabs", () => {
    const categories = [
      { id: 1, name: "Groceries", parent: null, is_tab_group: false, is_tab: false },
      { id: 2, name: "Tabs", parent: null, is_tab_group: true, is_tab: false },
      { id: 3, name: "Jan", parent: 2, is_tab_group: false, is_tab: true },
    ];

    expect(assignableCategories(categories).map((c) => c.name)).toEqual(["Groceries", "Jan"]);
  });
});

import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";
import { assignableCategories, coveredCategories, isStale, tabPreviewSentence, tabSentence } from "./tabs";

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

describe("tabPreviewSentence", () => {
  it("says how the tab will read, in the future tense", () => {
    expect(tabPreviewSentence("Sarah", -500)).toEqual({ text: `You'll owe Sarah ${formatMoney(500)}`, tone: "warning" });
    expect(tabPreviewSentence("Sarah", 500)).toEqual({ text: `Sarah will owe you ${formatMoney(500)}`, tone: "default" });
    expect(tabPreviewSentence("Sarah", 0)).toEqual({ text: "Settled", tone: "muted" });
  });
});

describe("coveredCategories", () => {
  it("drops tab groups and their tabs", () => {
    const categories = [
      { id: 1, name: "Takeout", parent: null, is_tab_group: false },
      { id: 2, name: "Tabs", parent: null, is_tab_group: true },
      { id: 3, name: "Sarah", parent: 2, is_tab_group: false },
      { id: 4, name: "Food", parent: null, is_tab_group: false },
      { id: 5, name: "Groceries", parent: 4, is_tab_group: false },
    ];
    expect(coveredCategories(categories).map((c) => c.id)).toEqual([1, 4, 5]);
  });
});

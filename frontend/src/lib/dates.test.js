import { describe, expect, it } from "vitest";
import { formatDateSpan, formatShortDate } from "./dates";

const TODAY = new Date(2026, 9, 23);

describe("formatShortDate", () => {
  it("leaves out this year", () => {
    const text = formatShortDate("2026-10-21", TODAY);
    expect(text).toMatch(/21/);
    expect(text).not.toMatch(/2026/);
  });

  it("adds another year", () => {
    expect(formatShortDate("2025-12-30", TODAY)).toMatch(/2025/);
  });
});

describe("formatDateSpan", () => {
  it("shows a single day once", () => {
    expect(formatDateSpan("2026-10-21", "2026-10-21", TODAY)).toBe(formatShortDate("2026-10-21", TODAY));
  });

  it("shows both ends of a span", () => {
    const text = formatDateSpan("2026-09-28", "2026-10-21", TODAY);
    expect(text).toMatch(/28/);
    expect(text).toMatch(/21/);
    expect(text).not.toMatch(/2026/);
  });

  it("adds the year when the span leaves this year", () => {
    expect(formatDateSpan("2025-12-30", "2026-01-02", TODAY)).toMatch(/2025/);
  });
});

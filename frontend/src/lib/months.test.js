import { afterEach, describe, expect, it, vi } from "vitest";
import { currentMonth, daysSince, isMonth, monthLabel, shiftMonth } from "./months";

afterEach(() => vi.useRealTimers());

describe("months", () => {
  it("takes the current month from local time, not UTC", () => {
    // 1 Nov 00:30 local; in any zone east of UTC that is still 31 Oct in UTC.
    const lateNight = new Date(2026, 10, 1, 0, 30);
    expect(currentMonth(lateNight)).toBe("2026-11");
  });

  it("shifts across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("labels months", () => {
    expect(monthLabel("2026-10")).toBe(new Date(2026, 9, 1).toLocaleString(undefined, { month: "long", year: "numeric" }));
  });

  it("checks the YYYY-MM shape", () => {
    expect(isMonth("2026-09")).toBe(true);
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth(null)).toBe(false);
  });

  it("counts days since a date in local time", () => {
    expect(daysSince("2026-10-12", new Date(2026, 9, 24, 23, 59))).toBe(12);
    expect(daysSince("2026-10-24", new Date(2026, 9, 24, 0, 1))).toBe(0);
  });
});

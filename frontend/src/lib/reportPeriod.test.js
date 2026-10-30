import { describe, expect, it } from "vitest";
import { monthCount, paramsForPeriod, periodFromParams, validCustomPeriod } from "./reportPeriod";

const NOW = "2026-10";
const period = (query) => periodFromParams(new URLSearchParams(query), NOW);

describe("periodFromParams", () => {
  it("defaults to the last 12 complete months", () => {
    expect(period("")).toEqual({ key: "12m", start: "2025-10", end: "2026-09" });
  });

  it("reads This year and Last year", () => {
    expect(period("period=year")).toEqual({ key: "year", start: "2026-01", end: "2026-10" });
    expect(period("period=last-year")).toEqual({ key: "last-year", start: "2025-01", end: "2025-12" });
  });

  it("reads a custom period", () => {
    expect(period("from=2026-01&to=2026-03")).toEqual({ key: "custom", start: "2026-01", end: "2026-03" });
  });

  it("treats a bad period as the default", () => {
    for (const query of ["from=march&to=2026-03", "from=2026-05&to=2026-03", "from=2020-01&to=2026-03"]) {
      expect(period(query).key).toBe("12m");
    }
  });
});

describe("validCustomPeriod", () => {
  it("allows 24 months, not 25", () => {
    expect(monthCount("2024-10", "2026-09")).toBe(24);
    expect(validCustomPeriod("2024-10", "2026-09", NOW)).toBe(true);
    expect(validCustomPeriod("2024-09", "2026-09", NOW)).toBe(false);
  });

  it("stops at the current month", () => {
    expect(validCustomPeriod("2026-01", "2026-11", NOW)).toBe(false);
  });
});

describe("paramsForPeriod", () => {
  it("keeps the address clean for the default", () => {
    expect(paramsForPeriod("12m")).toEqual({});
    expect(paramsForPeriod("year")).toEqual({ period: "year" });
    expect(paramsForPeriod("custom", { start: "2026-01", end: "2026-02" })).toEqual({ from: "2026-01", to: "2026-02" });
  });
});

import { describe, expect, it } from "vitest";
import { CURRENCY, formatMoney, formatMoneyCompact, formatMoneyWhole, formatSignedMoney } from "./money";

// The test environment runs with an English locale, so these are the
// en-US renderings; in the browser the separators follow its language.
describe("formatMoney", () => {
  it("formats cents as euro", () => {
    expect(CURRENCY).toBe("EUR");
    expect(formatMoney(123456)).toBe("€1,234.56");
    expect(formatMoney(4200)).toBe("€42.00");
  });

  it("handles negative and fractional amounts", () => {
    expect(formatMoney(-4250)).toBe("-€42.50");
    expect(formatMoney(5)).toBe("€0.05");
  });

  it("never shows a dollar sign", () => {
    expect(formatMoney(100)).not.toContain("$");
  });
});

describe("formatMoneyCompact", () => {
  it("shortens large amounts for chart axes", () => {
    expect(formatMoneyCompact(150000)).toBe("€1.5K");
    expect(formatMoneyCompact(-600000)).toBe("-€6K");
  });

  it("keeps small amounts whole", () => {
    expect(formatMoneyCompact(4200)).toBe("€42");
    expect(formatMoneyCompact(0)).toBe("€0");
    expect(formatMoneyCompact(-76950)).toBe("-€770");
  });
});

describe("formatMoneyWhole", () => {
  it("drops the cents", () => {
    expect(formatMoneyWhole(348217)).toBe(formatMoney(348200).replace(".00", ""));
    expect(formatMoneyWhole(348217)).not.toMatch(/\.17|,17/);
  });
});

describe("formatSignedMoney", () => {
  it("adds a plus only to money in, placed by the locale", () => {
    expect(formatSignedMoney(240000)).toMatch(/^\+/);
    expect(formatSignedMoney(-4520)).toMatch(/^[-−]/);
    // nl-BE puts the sign after the euro sign - why it is never glued on.
    expect(formatSignedMoney(240000, "nl-BE")).toMatch(/^€\s?\+2\.400,00$/);
  });
});

import { describe, expect, it } from "vitest";
import { currentIndex, scheduleWindow, termLabel } from "./loans";

function installments(states) {
  return states.map((state, index) => ({
    number: index + 1,
    date: new Date(Date.UTC(2024, 11 + index, 2)).toISOString().slice(0, 10),
    state,
  }));
}

describe("termLabel", () => {
  it("shows months and years", () => {
    expect(termLabel(300)).toBe("300 months (25 years)");
    expect(termLabel(270)).toBe("270 months (22 years 6 months)");
    expect(termLabel(12)).toBe("12 months (1 year)");
    expect(termLabel(7)).toBe("7 months");
  });
});

describe("scheduleWindow", () => {
  // A 300-month loan set up at installment 20, at installment 24.
  const long = installments([
    ...Array(19).fill("before_setup"),
    ...Array(4).fill("posted"),
    "due",
    ...Array(276).fill("upcoming"),
  ]);

  it("opens on the last two posted, the current one and the next twelve", () => {
    expect(currentIndex(long)).toBe(23);
    const { start, end } = scheduleWindow(long);
    expect(long.slice(start, end).map((i) => i.number)).toEqual([22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]);
  });

  it("doesn't reach back before setup on its own", () => {
    const fresh = installments([...Array(5).fill("before_setup"), "due", ...Array(20).fill("upcoming")]);
    expect(scheduleWindow(fresh).start).toBe(5);
  });

  it("brings a focused installment into view", () => {
    const missed = installments([...Array(10).fill("missed"), "due", ...Array(5).fill("upcoming")]);
    const { start, end } = scheduleWindow(missed, 2);
    expect(start).toBeLessThanOrEqual(1);
    expect(end).toBeGreaterThan(1);
  });

  it("skips covered installments when finding the current one", () => {
    const corrected = installments([...Array(3).fill("covered"), "due", ...Array(5).fill("upcoming")]);
    expect(currentIndex(corrected)).toBe(3);
  });

  it("keeps the latest correction in view", () => {
    // The correction falls between installments 15 and 16, well before
    // the current one (24).
    const keepDate = long[14].date.replace(/-\d\d$/, "-20");
    const { start } = scheduleWindow(long, null, keepDate);
    expect(long[start].number).toBe(16);
  });

  it("falls back to the last installment when everything is posted", () => {
    const done = installments(Array(5).fill("posted"));
    expect(currentIndex(done)).toBe(4);
    expect(scheduleWindow(done)).toEqual({ start: 2, end: 5 });
  });
});

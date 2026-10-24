// Months are "YYYY-MM" strings in the browser's local time, so "the
// current month" is the user's, not the UTC server's. Shared by every
// page that is about one month - see the ui-shell spec's month switcher.

export function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month, delta) {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// "October 2026", or "Oct 2026" when short.
export function monthLabel(month, { short = false } = {}) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString(undefined, { month: short ? "short" : "long", year: "numeric" });
}

// "October" - for "in October" style wording.
export function monthName(month) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString(undefined, { month: "long" });
}

export function isMonth(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// Whole days from an ISO date ("2026-10-12") to today, in local time.
export function daysSince(isoDate, now = new Date()) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / 86_400_000);
}

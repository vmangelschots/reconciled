// Helpers for the loan schedule page - see the loan-schedules spec.

// 300 -> "300 months (25 years)", 270 -> "270 months (22 years 6 months)"
export function termLabel(months) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts = [years > 0 && plural(years, "year"), rest > 0 && years > 0 && plural(rest, "month")].filter(Boolean);
  return parts.length > 0 ? `${plural(months, "month")} (${parts.join(" ")})` : plural(months, "month");
}

const SHOWN_BEFORE = 2;
const SHOWN_AFTER = 12;

// The installment the schedule opens on: the one due, else the first not
// yet posted, else the last.
export function currentIndex(installments) {
  const due = installments.findIndex((i) => i.state === "due");
  if (due >= 0) return due;
  const open = installments.findIndex((i) => i.state !== "before_setup" && i.state !== "posted");
  return open >= 0 ? open : installments.length - 1;
}

// Which installments show before "Show earlier" / "Show all": the last
// two posted ones, the current one and the next twelve. `focus` is an
// installment number that must be in view (from a Needs attention link).
export function scheduleWindow(installments, focus = null) {
  let current = currentIndex(installments);
  const focusIndex = focus == null ? -1 : installments.findIndex((i) => i.number === focus);
  if (focusIndex >= 0 && (focusIndex < current - SHOWN_BEFORE || focusIndex > current + SHOWN_AFTER)) {
    current = focusIndex;
  }
  const firstAfterSetup = installments.findIndex((i) => i.state !== "before_setup");
  const floor = firstAfterSetup >= 0 && firstAfterSetup <= current ? firstAfterSetup : 0;
  const start = Math.max(floor, current - SHOWN_BEFORE);
  const end = Math.min(installments.length, current + SHOWN_AFTER + 1);
  return { start, end };
}

import { formatMoney } from "./money";

// A tab's balance is never shown as a signed number: whose side the sign
// is on is exactly what people get wrong. See specs/repayment-tabs.
// tone: "default" (owed to you - never the income green), "warning"
// (you owe them) or "muted" (settled).
export function tabSentence(name, balanceCents) {
  if (balanceCents > 0) return { text: `${name} owes you ${formatMoney(balanceCents)}`, tone: "default" };
  if (balanceCents < 0) return { text: `You owe ${name} ${formatMoney(-balanceCents)}`, tone: "warning" };
  return { text: "Settled", tone: "muted" };
}

export const TONE_CLASS = {
  default: "text-ink-primary",
  warning: "text-warning",
  muted: "text-ink-muted",
};

export const STALE_AFTER_DAYS = 30;

// True once a tab has been open for more than 30 days.
export function isStale(openSince, today = new Date()) {
  if (!openSince) return false;
  const opened = Date.parse(`${openSince}T00:00:00Z`);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return (now - opened) / 86_400_000 > STALE_AFTER_DAYS;
}

// The categories a transaction or part may get: everything but tab
// groups, which are only headings for their tabs.
export function assignableCategories(categories) {
  return categories.filter((c) => !c.is_tab_group);
}

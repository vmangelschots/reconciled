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

// The sentence a tab will read after a covered entry, for the form's
// preview: "You'll owe Sarah €5.00", "Sarah will owe you €5.00" or
// "Settled". Same tones as tabSentence.
export function tabPreviewSentence(name, balanceCents) {
  if (balanceCents > 0) return { text: `${name} will owe you ${formatMoney(balanceCents)}`, tone: "default" };
  if (balanceCents < 0) return { text: `You'll owe ${name} ${formatMoney(-balanceCents)}`, tone: "warning" };
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

// The categories a covered entry may go to: assignable, and not a tab -
// its cost is spending, never a debt.
export function coveredCategories(categories) {
  const groups = new Set(categories.filter((c) => c.is_tab_group).map((c) => c.id));
  return categories.filter((c) => !c.is_tab_group && !groups.has(c.parent));
}

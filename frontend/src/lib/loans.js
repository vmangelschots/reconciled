// Helpers for the loan schedule page - see the loan-schedules spec.
import { formatMoneyWhole } from "./money";

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
// yet posted (or covered by a correction), else the last.
export function currentIndex(installments) {
  const due = installments.findIndex((i) => i.state === "due");
  if (due >= 0) return due;
  const open = installments.findIndex((i) => !["before_setup", "posted", "covered"].includes(i.state));
  return open >= 0 ? open : installments.length - 1;
}

// Which installments show before "Show earlier" / "Show all": the last
// two posted ones, the current one and the next twelve. `focus` is an
// installment number that must be in view (from a Needs attention link).
// `keepDate` is the latest correction's date: the installment after it,
// which its row sits above, stays in view too.
export function scheduleWindow(installments, focus = null, keepDate = null) {
  let current = currentIndex(installments);
  const focusIndex = focus == null ? -1 : installments.findIndex((i) => i.number === focus);
  if (focusIndex >= 0 && (focusIndex < current - SHOWN_BEFORE || focusIndex > current + SHOWN_AFTER)) {
    current = focusIndex;
  }
  const firstAfterSetup = installments.findIndex((i) => i.state !== "before_setup");
  const floor = firstAfterSetup >= 0 && firstAfterSetup <= current ? firstAfterSetup : 0;
  let start = Math.max(floor, current - SHOWN_BEFORE);
  const end = Math.min(installments.length, current + SHOWN_AFTER + 1);
  if (keepDate != null) {
    const after = installments.findIndex((i) => i.date > keepDate);
    start = Math.min(start, after >= 0 ? after : installments.length - 1);
  }
  return { start, end };
}

const names = (loans) => {
  const list = loans.map((l) => l.name);
  return list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`;
};

// What a category's own budget is, in words, or null when it has none.
function ownBudget(category) {
  if (category.budget_kind === "bills") {
    const count = category.bills?.length ?? 0;
    return count > 0 ? `${count} ${count === 1 ? "bill" : "bills"}` : null;
  }
  if (category.budget_kind === "yearly" || category.budget_kind === "target") {
    return category.yearly ? `${formatMoneyWhole(category.yearly.amount_cents)} yearly budget` : null;
  }
  const { default_cents: defaultCents, override_count: overrides = 0 } = category.monthly_limits ?? {};
  if (defaultCents != null) return `${formatMoneyWhole(defaultCents)} monthly budget`;
  return overrides > 0 ? "monthly budget" : null;
}

/**
 * What saving this loan with payment category `chosenId` does to budgets,
 * as notes for under the field: [{ tone: "warning" | "muted", text }]. A
 * chosen category with its own budget loses it; one that follows other loans
 * gets this one too; the category left behind goes back to no budget when no
 * other loan pays into it. See the loan-schedules spec.
 */
export function paymentCategoryNotes(chosenId, previousId, accountId, categoriesById) {
  const notes = [];
  const others = (category) => (category.loans ?? []).filter((l) => l.account_id !== accountId);
  const chosen = chosenId != null ? categoriesById[chosenId] : null;
  if (chosen && chosenId !== previousId) {
    const joined = others(chosen);
    const own = ownBudget(chosen);
    if (joined.length > 0) {
      notes.push({ tone: "muted", text: `Joins ${names(joined)} in ${chosen.name}'s bills.` });
    } else if (own) {
      notes.push({ tone: "warning", text: `${chosen.name}'s ${own} will be replaced by this loan's payment.` });
    }
  }
  const previous = previousId != null ? categoriesById[previousId] : null;
  if (previous && chosenId !== previousId && others(previous).length === 0) {
    notes.push({ tone: "muted", text: `${previous.name} goes back to no budget.` });
  }
  return notes;
}

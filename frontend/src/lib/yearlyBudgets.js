// Wording for yearly and yearly-on-a-date budgets, shared by the Budgets
// page and the overview - see specs/yearly-budgets.
import { formatMoney, formatMoneyWhole } from "./money";

const dayMonth = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const shortMonth = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: "UTC" });

function parse(isoDate) {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
}

// "2026-11-01" -> "1 Nov" (or "Nov 1", per the browser's language).
export function formatDayMonth(isoDate) {
  return dayMonth.format(parse(isoDate));
}

// "11-01" (a due date without a year) -> "1 Nov".
export function formatDue(due) {
  return formatDayMonth(`2025-${due}`);
}

// "2026-10-01" -> "Oct".
export function formatShortMonth(isoDate) {
  return shortMonth.format(parse(isoDate));
}

// Whole days from one ISO date to another.
export function daysBetween(fromIso, toIso) {
  return Math.round((parse(toIso) - parse(fromIso)) / 86_400_000);
}

// A difference shown in whole euros when it is whole, else with cents:
// "€9", "€1.88".
export function formatDifference(cents) {
  const abs = Math.abs(cents);
  return abs % 100 === 0 ? formatMoneyWhole(abs) : formatMoney(abs);
}

export const TARGET_TONE = {
  upcoming: "neutral",
  due_soon: "reminder",
  not_seen: "warning",
  overdue: "critical",
  partly_paid: "warning",
  paid: "positive",
  paid_over: "positive",
};

// The state of a yearly budget on a date, as one line: "Due 1 Nov, in 8
// days", "Overdue since 1 Nov", "Paid · €20 over". `through` is the day
// the figures are given as of.
export function targetLabel(row, through) {
  const due = formatDayMonth(row.due_date);
  const paid = row.spent_cents > 0 ? ` · ${formatMoneyWhole(row.spent_cents)} paid` : "";
  const diff = row.spent_cents - row.budget_cents;
  switch (row.state) {
    case "due_soon": {
      const days = daysBetween(through, row.due_date);
      return `Due ${due}, ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}${paid}`;
    }
    case "not_seen":
      return row.spent_cents > 0
        ? `Due ${due} · ${formatMoneyWhole(row.spent_cents)} of ${formatMoneyWhole(row.budget_cents)} paid`
        : `Due ${due}, not seen yet`;
    case "overdue":
      return `Overdue since ${due}`;
    case "partly_paid":
      return `Partly paid · ${formatDifference(diff)} short`;
    case "paid":
      if (diff === 0) return "Paid";
      return `Paid · ${formatDifference(diff)} ${diff > 0 ? "over" : "under"}`;
    case "paid_over":
      return `Paid · ${formatDifference(diff)} over`;
    default:
      return `Due ${due}${paid}`;
  }
}

// "€40 a month to Dec", or "€30 over for 2026" when over; null for a
// month without a runway (any month but the current one).
export function runwayLabel(row, year) {
  if (row.over) return `${formatMoneyWhole(row.spent_cents - row.budget_cents)} over for ${year}`;
  if (row.runway_cents == null) return null;
  return `${formatMoneyWhole(row.runway_cents)} a month to Dec`;
}

// What a category's budget is, in a few words: "Monthly · €400.00",
// "Yearly · €1,200.00 a year", "On a date · €400.00 on 1 Nov". Null when
// there is nothing to say.
export function budgetSummary(category) {
  if (category.is_tab_group || category.is_tab) return null;
  if (category.budget_kind === "yearly" && category.yearly) {
    return `Yearly · ${formatMoney(category.yearly.amount_cents)} a year`;
  }
  if (category.budget_kind === "target" && category.yearly) {
    return `On a date · ${formatMoney(category.yearly.amount_cents)} on ${formatDue(category.yearly.due)}`;
  }
  if (category.monthly_limits?.default_cents != null) {
    return `Monthly · ${formatMoney(category.monthly_limits.default_cents)}`;
  }
  return null;
}

// The amount a yearly budget is for `year` in its history (newest first):
// the newest line from that year or before, else the oldest.
export function historyValuesFor(history, year) {
  if (!history?.length) return null;
  return history.find((h) => h.from_year <= year) ?? history[history.length - 1];
}

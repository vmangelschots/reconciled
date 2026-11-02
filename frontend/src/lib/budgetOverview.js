// Turns the budget summary into what the Budgets page shows, and the wording
// it shares with the overview - see specs/budget-overview.
import { formatMoneyWhole as whole } from "./money";
import { daysSince, monthLabel } from "./months";
import { formatDayMonth, formatShortMonth, runwayLabel, TARGET_TONE, targetLabel } from "./yearlyBudgets";

// The line below the headline: the rest of the month's spending.
export function budgetExtras(totals) {
  return [
    totals.yearly_spent_cents > 0 && `${whole(totals.yearly_spent_cents)} on yearly budgets`,
    totals.outside_cents > 0 && `+${whole(totals.outside_cents)} outside budgets`,
    totals.uncategorized_cents > 0 && `${whole(totals.uncategorized_cents)} uncategorized`,
  ].filter(Boolean);
}

// What's left per remaining day in whole euros, or null.
export function perDayCents(leftCents, daysLeft) {
  return leftCents > 0 && daysLeft ? Math.floor(leftCents / 100 / daysLeft) * 100 : null;
}

export function categoryWarning(c) {
  return {
    primary: c.over ? `${c.name} ${whole(c.spent_cents - c.limit_cents)} over` : `${c.name} at ${c.share}%`,
    secondary: `${c.parent_name ? `${c.parent_name} · ` : ""}${whole(c.spent_cents)} of ${whole(c.limit_cents)}`,
    critical: c.over,
  };
}

export function yearlyWarning(y, year) {
  const over = y.spent_cents - y.budget_cents;
  const daysLeft = y.due_date ? -daysSince(y.due_date) : null;
  const primary = {
    over: `${y.name} ${whole(over)} over`,
    ahead: `${y.name} at ${y.share}% of ${year}`,
    due_soon: `${y.name} due ${daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}`,
    not_seen: `${y.name} not seen yet`,
    overdue: `${y.name} overdue`,
    partly_paid: `${y.name} ${whole(-over)} short`,
  }[y.state];
  const figures =
    y.kind === "target"
      ? `Due ${formatDayMonth(y.due_date)} · ${whole(y.spent_cents)} of ${whole(y.budget_cents)}`
      : `Yearly · ${whole(y.spent_cents)} of ${whole(y.budget_cents)}`;
  return {
    primary,
    secondary: `${y.parent_name ? `${y.parent_name} · ` : ""}${figures}`,
    critical: y.state === "over" || y.state === "overdue",
    upcoming: y.state === "due_soon",
  };
}

// The headline's verdict, or null when there is nothing to judge.
export function verdict(summary, month, thisMonth) {
  const { totals, attention } = summary;
  if (month > thisMonth) return null;
  if (month < thisMonth) {
    if (!totals.has_limits) return null;
    const left = totals.limit_cents - totals.spent_cents;
    if (left === 0) return "Finished on budget";
    return `Finished ${whole(Math.abs(left))} ${left < 0 ? "over" : "under"}`;
  }
  const count = attention.categories.length + attention.yearly.length;
  if (count > 0) return `${count} ${count === 1 ? "needs" : "need"} a look`;
  return totals.has_limits ? "On track" : null;
}

function leftFigure(leftCents) {
  return leftCents < 0 ? `${whole(-leftCents)} over` : `${whole(leftCents)} left`;
}

function joined(...parts) {
  return parts.filter(Boolean).join(" · ");
}

function coverage(row, budgetCents) {
  if (!row.covers_subcategories) return null;
  return row.caps_cents > budgetCents
    ? `includes subcategories, caps add up to ${whole(row.caps_cents)}`
    : "includes subcategories";
}

function monthlyRow(row, summary, byId) {
  const base = { id: row.category_id, name: row.category_name, parentId: row.parent_id, limitCents: row.limit_cents };
  const spentCents = row.group_spent_cents ?? row.spent_cents;
  if (row.limit_cents == null) {
    return {
      ...base,
      budgeted: false,
      spentCents,
      figure: `${whole(spentCents)} spent`,
      caption: row.covered_by_parent ? `Covered by ${byId[row.parent_id]?.name ?? "its parent"}` : null,
      covered: row.covered_by_parent,
    };
  }
  const warned = !row.over_limit && summary.attention.categories.some((c) => c.id === row.category_id);
  return {
    ...base,
    budgeted: true,
    spentCents: row.spent_cents,
    budgetCents: row.limit_cents,
    bar: { value: row.spent_cents, max: row.limit_cents, marker: summary.pace, tone: warned ? "warning" : undefined },
    figure: leftFigure(row.remaining_cents),
    critical: row.over_limit,
    caption: joined(
      `${whole(row.spent_cents)} of ${whole(row.limit_cents)} a month`,
      row.overridden && "this month only",
      coverage(row, row.limit_cents),
    ),
  };
}

function yearlyRow(row, year) {
  return {
    id: row.category_id,
    name: row.category_name,
    parentId: row.parent_id,
    limitCents: null,
    budgeted: true,
    spentCents: row.spent_cents,
    budgetCents: row.budget_cents,
    bar: { value: row.spent_cents, max: row.budget_cents, marker: row.pace, tone: row.ahead ? "warning" : undefined },
    figure: leftFigure(row.remaining_cents),
    critical: row.over,
    caption: joined(
      `${whole(row.spent_cents)} of ${whole(row.budget_cents)} a year`,
      row.prorated_from && `of ${whole(row.amount_cents)} · from ${formatShortMonth(row.prorated_from)}`,
      runwayLabel(row, year),
      coverage(row, row.budget_cents),
    ),
  };
}

const lowerFirst = (text) => text[0].toLowerCase() + text.slice(1);

function targetRow(row, through) {
  const paid = row.state === "paid" || row.state === "paid_over";
  const waiting = row.state === "due_soon" || row.state === "upcoming";
  // The caption already says what was paid.
  const label = targetLabel(waiting ? { ...row, spent_cents: 0 } : row, through);
  return {
    id: row.category_id,
    name: row.category_name,
    parentId: row.parent_id,
    limitCents: null,
    budgeted: true,
    spentCents: row.spent_cents,
    budgetCents: row.budget_cents,
    bar: { value: row.spent_cents, max: row.budget_cents, tone: row.state === "paid" ? "positive" : undefined },
    figure: paid ? "Paid" : `${whole(row.remaining_cents)} to pay`,
    critical: TARGET_TONE[row.state] === "critical",
    caption: joined(
      `${whole(row.spent_cents)} of ${whole(row.budget_cents)}`,
      lowerFirst(label),
      coverage(row, row.budget_cents),
    ),
  };
}

/**
 * The page's list. `rows` are in category order, each subcategory after its
 * parent, whatever their kinds; `noBudget` holds top-level categories with
 * no budget under them, collapsed into one row.
 */
export function budgetList(summary, categories) {
  const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
  const yearly = summary.yearly;
  const all = [
    ...summary.categories.map((row) => monthlyRow(row, summary, byId)),
    ...yearly.categories.map((row) =>
      row.kind === "target" ? targetRow(row, yearly.through) : yearlyRow(row, yearly.year),
    ),
  ];
  const ids = new Set(all.map((r) => r.id));
  const label = (r) => (r.parentId && byId[r.parentId] ? `${byId[r.parentId].name} / ${r.name}` : r.name);
  const tops = all
    .filter((r) => !ids.has(r.parentId))
    .map((r) => ({ ...r, name: label(r), indent: false }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows = [];
  const noBudget = { rows: [], spentCents: 0, count: 0 };
  for (const top of tops) {
    const subs = all
      .filter((r) => r.parentId === top.id)
      .map((r) => ({ ...r, indent: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (top.budgeted || subs.some((s) => s.budgeted)) {
      rows.push(top, ...subs);
    } else {
      noBudget.rows.push(top, ...subs);
      noBudget.spentCents += top.spentCents;
      noBudget.count += 1;
    }
  }
  return { rows, noBudget };
}

// When yearly figures count from and to, for the line below the list.
export function startMonthLine(yearly) {
  const start = yearly.start_month?.slice(0, 7);
  return start ? `Yearly budgets count from ${monthLabel(start)}` : "Yearly budgets count the whole year";
}

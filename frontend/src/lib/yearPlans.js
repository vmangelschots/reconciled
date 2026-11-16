// Wording and small sums for the Year view - see specs/year-plans.
import { formatMoneyWhole as whole } from "./money";

export const KIND_NAME = { monthly: "monthly", yearly: "yearly", target: "on a date", bills: "bills", none: "no budget" };

// "Jan" .. "Dec" for month 1-12.
export function shortMonth(month) {
  return new Date(2025, month - 1, 1).toLocaleString(undefined, { month: "short" });
}

// "January" .. "December".
export function longMonth(month) {
  return new Date(2025, month - 1, 1).toLocaleString(undefined, { month: "long" });
}

// The Actual column's header: "Last 12 mo (Nov–Oct)", "So far", or the year.
export function actualHeader(actual, year) {
  if (actual.kind === "last_12") {
    const from = Number(actual.from.slice(5, 7));
    const until = Number(actual.until.slice(5, 7));
    return `Last 12 mo (${shortMonth(from)}–${shortMonth(until)})`;
  }
  if (actual.kind === "so_far") return "So far";
  return `Actual ${year}`;
}

// What a row's plan reads as: "600 a month", "3,000 a year", "780 on 1 Mar".
export function planCaption(row) {
  if (row.kind === "monthly" && row.default_cents != null) {
    const exceptions = Object.keys(row.exceptions ?? {}).length;
    const extra = exceptions ? ` · ${exceptions} ${exceptions === 1 ? "month differs" : "months differ"}` : "";
    return `${whole(row.default_cents)} a month${extra}`;
  }
  if (row.kind === "yearly") return "a year";
  if (row.kind === "target" && row.due) {
    const [m, d] = row.due.split("-").map(Number);
    return `on ${d} ${shortMonth(m)}`;
  }
  if (row.kind === "bills") {
    if (row.locked) return row.loans?.length ? `${row.loans.map((l) => l.name).join(", ")} installments` : "loan installments";
    const count = row.bills?.length ?? 0;
    return `${count} ${count === 1 ? "bill" : "bills"}`;
  }
  if (row.kind === "none") return "no budget";
  return "";
}

// The figure "Current had" for a changed row, in its own unit.
export function currentFigure(row) {
  const current = row.current;
  if (!current || current.display_cents == null) return null;
  if (current.kind === "monthly") return `${whole(current.display_cents)} a month`;
  return whole(current.plan_cents);
}

// The year's headline line: "€3,700 left to save · 9% of €42,600 income".
export function leftLine(totals) {
  if (totals.left_cents < 0) return `${whole(-totals.left_cents)} short`;
  return `${whole(totals.left_cents)} left to save`;
}

// Removed amounts, as words: "its monthly limit and 3 month overrides".
export function removesPhrase(removes) {
  if (!removes) return null;
  const parts = [];
  if (removes.defaults) parts.push("its monthly limits");
  if (removes.overrides) parts.push(`${removes.overrides} month ${removes.overrides === 1 ? "override" : "overrides"}`);
  if (removes.yearly_years) parts.push("its yearly amounts and history");
  if (removes.bills) parts.push(`its ${removes.bills} ${removes.bills === 1 ? "bill" : "bills"}`);
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function amount(cents, per) {
  if (cents == null) return "none";
  return per === "month" ? `${whole(cents)} a month` : `${whole(cents)} a year`;
}

// One preview line: { title, detail, warning }.
export function changeLine(change) {
  const name = change.category_name;
  if (change.remove) {
    const what = removesPhrase(change.kind_switch?.removes);
    return {
      title: `${name}: no budget`,
      detail: `For every month, earlier ones included${what ? `; ${what} go` : ""}.`,
      warning: true,
    };
  }
  if (change.kind_switch) {
    const what = removesPhrase(change.kind_switch.removes);
    const to = change.to_kind === "monthly" || change.to_kind === "bills" ? amount(change.to_cents, "month") : amount(change.to_cents, "year");
    return {
      title: `${name} becomes ${KIND_NAME[change.to_kind]} ${to.replace(" a year", "").replace(" a month", "")}`.trim(),
      detail: `For every month, earlier ones included${what ? `; ${what} go` : ""}.`,
      warning: Boolean(what),
    };
  }
  if (change.give) {
    return { title: `${name}: new budget, ${amount(change.to_cents, change.per)}`, detail: null, warning: false };
  }
  if (change.bills) {
    const parts = [];
    if (change.bills.added) parts.push(`+${change.bills.added} ${change.bills.added === 1 ? "bill" : "bills"}`);
    if (change.bills.ended) parts.push(`${change.bills.ended} ${change.bills.ended === 1 ? "bill ends" : "bills end"}`);
    return {
      title: `${name} ${parts.join(", ")}`,
      detail: `${whole(change.from_cents)} → ${whole(change.to_cents)} a month`,
      warning: false,
    };
  }
  const lines = [];
  if (change.from_cents !== change.to_cents) {
    lines.push(`${change.from_cents == null ? "none" : whole(change.from_cents)} → ${amount(change.to_cents, change.per)}`);
  }
  if (change.exceptions) {
    const set = change.exceptions.set.map(shortMonth);
    const removed = change.exceptions.removed.map(shortMonth);
    if (set.length) lines.push(`own amount in ${set.join(", ")}`);
    if (removed.length) lines.push(`${removed.join(", ")} back to the default`);
  }
  return { title: name, detail: lines.join(" · ") || "from this month on", warning: false };
}

// The income line's plan, in words: "3,200 a month + May, Dec".
export function incomeCaption(line) {
  const base = `${whole(line.amount_cents)} a ${line.per}`;
  const months = Object.keys(line.extra ?? {})
    .map(Number)
    .sort((a, b) => a - b)
    .map(shortMonth);
  return months.length ? `${base} + ${months.join(", ")}` : base;
}

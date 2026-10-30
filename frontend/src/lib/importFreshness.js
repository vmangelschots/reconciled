import { daysSince } from "./months";
import { VALUED_TYPES } from "./tiers";

// The last import counts as stale after this many days - see the
// overview spec's "Stale import reminder".
const STALE_IMPORT_DAYS = 7;

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function freshness(lastImportDate) {
  if (!lastImportDate) return { text: "No imports yet", stale: true, days: Infinity };
  const days = daysSince(lastImportDate);
  const text = days <= 0 ? "imported today" : `imported ${plural(days, "day", "days")} ago`;
  return { text, stale: days > STALE_IMPORT_DAYS, days };
}

// One line about every stale account: named when there is one, counted
// when there are several. Null when nothing is stale.
export function staleImports(accounts) {
  const stale = accounts
    .filter((a) => !VALUED_TYPES.has(a.account_type))
    .map((a) => ({ ...a, fresh: freshness(a.last_import_date) }))
    .filter((a) => a.fresh.stale)
    .sort((a, b) => b.fresh.days - a.fresh.days);
  if (stale.length === 0) return null;
  const [stalest] = stale;
  let text = `${stale.length} accounts not imported this week`;
  if (stale.length === 1) {
    text = stalest.last_import_date
      ? `${stalest.name}: last import ${plural(stalest.fresh.days, "day", "days")} ago`
      : `${stalest.name}: no imports yet`;
  }
  return { text, stalest };
}

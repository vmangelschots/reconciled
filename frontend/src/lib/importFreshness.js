import { daysSince } from "./months";
import { VALUED_TYPES } from "./tiers";

// The last import counts as stale after this many days - see the
// overview spec's "Stale import reminder".
const STALE_IMPORT_DAYS = 7;

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function freshness(lastImportDate, linked = false) {
  if (!lastImportDate) return { text: linked ? "Not synced yet" : "No imports yet", stale: true, days: Infinity };
  const days = daysSince(lastImportDate);
  const verb = linked ? "synced" : "imported";
  const text = days <= 0 ? `${verb} today` : `${verb} ${plural(days, "day", "days")} ago`;
  return { text, stale: days > STALE_IMPORT_DAYS, days };
}

// One line about every stale account: named when there is one, counted
// when there are several. Null when nothing is stale.
export function staleImports(accounts) {
  const stale = accounts
    // The reconnect line covers a bank whose consent has ended.
    .filter((a) => !VALUED_TYPES.has(a.account_type) && !a.bank_ended)
    .map((a) => ({ ...a, fresh: freshness(a.last_import_date, a.bank_linked) }))
    .filter((a) => a.fresh.stale)
    .sort((a, b) => b.fresh.days - a.fresh.days);
  if (stale.length === 0) return null;
  const [stalest] = stale;
  let text = `${stale.length} accounts not imported this week`;
  if (stale.length === 1) {
    text = stalest.last_import_date
      ? `${stalest.name}: last ${stalest.bank_linked ? "sync" : "import"} ${plural(stalest.fresh.days, "day", "days")} ago`
      : `${stalest.name}: no ${stalest.bank_linked ? "syncs" : "imports"} yet`;
  }
  return { text, stalest };
}

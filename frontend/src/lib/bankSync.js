// The bank sync status shown in page headers and Settings - see
// specs/bank-sync, "Sync status". Works on GET /api/bank-sync/'s shape.

const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "18:32".
export function formatSyncClock(iso) {
  return time.format(new Date(iso));
}

// "11 Nov 18:32", for a link's last sync in Settings.
export function formatSyncTime(iso) {
  const at = new Date(iso);
  return `${dayMonth.format(at)} ${time.format(at)}`;
}

// "18:32" today, "yesterday 18:32", or "9 Nov 18:32".
export function formatSyncedAt(iso, now = new Date()) {
  const at = new Date(iso);
  if (sameDay(at, now)) return time.format(at);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(at, yesterday)) return `yesterday ${time.format(at)}`;
  return formatSyncTime(iso);
}

// Every link of the household, with what's wrong with it, if anything.
export function bankLinks(status) {
  if (!status?.enabled) return [];
  const links = [];
  for (const connection of status.connections ?? []) {
    for (const account of connection.accounts) {
      if (!account.link) continue;
      links.push({
        ...account.link,
        bank_name: connection.bank_name,
        problem: connection.ended ? "reconnect" : account.link.last_error ? "error" : null,
      });
    }
  }
  for (const link of status.waiting_links ?? []) {
    links.push({ ...link, problem: "reconnect" });
  }
  return links;
}

// What the sync status shows, or null when it's hidden:
// { state: "stopped" | "running" | "synced", lastSyncedAt, issues, links }.
export function syncSummary(status) {
  const links = bankLinks(status);
  const credentials = status?.credentials;
  if (links.length === 0 || !(credentials?.state === "ready" || credentials?.stopped)) return null;
  const synced = links.map((l) => l.last_synced_at).filter(Boolean);
  const lastSyncedAt = synced.length ? synced.reduce((a, b) => (new Date(a) > new Date(b) ? a : b)) : null;
  const issues = links.filter((l) => l.problem).length;
  const state = credentials.stopped ? "stopped" : status.running ? "running" : "synced";
  return { state, lastSyncedAt, issues, links };
}

// The status's label, e.g. "Synced 18:32 · 1 issue". `result` is a sync that
// just ended: { added } (null when it isn't known).
export function syncLabel(summary, result, now = new Date(), short = false) {
  if (summary.state === "stopped") return "Bank sync stopped";
  if (summary.state === "running") return "Syncing…";
  let text;
  if (result) {
    text = short ? "Just now" : "Synced just now";
    if (result.added) text += `, +${result.added}`;
  } else if (summary.lastSyncedAt) {
    const when = formatSyncedAt(summary.lastSyncedAt, now);
    text = short ? when : `Synced ${when}`;
  } else {
    text = "Not synced yet";
  }
  if (summary.issues) text += ` · ${summary.issues} ${summary.issues === 1 ? "issue" : "issues"}`;
  return text;
}

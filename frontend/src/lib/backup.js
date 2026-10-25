// Wording for backups on the Settings page.
const madeOn = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

export const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

// "Made 20 Oct 2026 · 3 accounts · 1,204 transactions"
export function backupLine({ exportedAt, accounts, transactions }) {
  return `Made ${madeOn.format(new Date(exportedAt))} · ${plural(accounts, "account")} · ${plural(transactions, "transaction")}`;
}

// Wording for backups on the Settings page.
const madeOn = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

export const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

// "Made 20 Oct 2026 · 3 accounts · 1,204 transactions", with the backup's
// household when it isn't the one restoring it.
export function backupLine({ exportedAt, household, accounts, transactions }, activeHousehold) {
  const from = household && household !== activeHousehold ? [household] : [];
  return [
    `Made ${madeOn.format(new Date(exportedAt))}`,
    ...from,
    plural(accounts, "account"),
    plural(transactions, "transaction"),
  ].join(" · ");
}

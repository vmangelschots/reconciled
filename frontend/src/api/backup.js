import { apiUpload } from "./client";

// Same base URL rule as client.js.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export const NOT_A_BACKUP = "This file isn't a Reconciled backup.";
export const UNREADABLE = "This backup can't be read. It may be damaged or cut off.";

function todaysFilename(today = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `reconciled-backup-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.json`;
}

// The server names the file; that header isn't readable cross-origin (local
// development), so fall back to the same name built here.
function filenameFrom(response) {
  const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "");
  return match ? match[1] : todaysFilename();
}

/** Download a backup of everything and save it as a file. */
export async function downloadBackup() {
  const response = await fetch(`${API_BASE_URL}/api/backup/`, { credentials: "include" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const error = new Error(data?.detail || "The backup couldn't be made.");
    error.status = response.status;
    throw error;
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFrom(response);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * What a picked file says about itself, for the confirm step:
 * { exportedAt, accounts, transactions }. Rejects a file that isn't a
 * Reconciled backup; the server checks the rest when restoring.
 */
export async function readBackupSummary(file) {
  const text = await file.text();
  if (!text.trimStart().startsWith("{")) throw new Error(NOT_A_BACKUP);
  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error(UNREADABLE);
  }
  if (backup?.app !== "reconciled" || !backup.summary) throw new Error(NOT_A_BACKUP);
  return {
    exportedAt: backup.exported_at,
    accounts: backup.summary.accounts,
    transactions: backup.summary.transactions,
  };
}

/** Replace everything with the backup's data; resolves to { accounts, transactions }. */
export function restoreBackup(file) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload("/api/backup/restore/", formData);
}

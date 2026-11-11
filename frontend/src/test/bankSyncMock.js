// Stands in for bankSync/BankSyncContext in page tests:
//   vi.mock("../bankSync/BankSyncContext", () => import("../test/bankSyncMock"));
// then setBankSync(linkedBankSync()) inside act() to show the sync status,
// or linkedBankSync(1) to end a sync.
import { useSyncExternalStore } from "react";
import { syncSummary } from "../lib/bankSync";

function hidden() {
  return { status: null, summary: null, result: null, version: 0, reload: async () => null, syncNow: async () => {} };
}

let value = hidden();
const listeners = new Set();

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useBankSync() {
  return useSyncExternalStore(subscribe, () => value);
}

export function BankSyncProvider({ children }) {
  return children;
}

export function setBankSync(next) {
  value = next;
  listeners.forEach((listener) => listener());
}

export function resetBankSync() {
  value = hidden();
}

export function linkedBankSync(version = 0) {
  const status = {
    enabled: true,
    running: false,
    next_sync_at: null,
    credentials: { state: "ready", stopped: false },
    connections: [
      {
        id: 1,
        bank_name: "Crelan",
        ended: false,
        accounts: [
          {
            uid: "u1",
            name: "Zicht",
            link: { id: 1, account_name: "Joint", last_synced_at: null, last_added_count: 0, last_error: "" },
          },
        ],
      },
    ],
    waiting_links: [],
  };
  return { ...hidden(), status, summary: syncSummary(status), version };
}

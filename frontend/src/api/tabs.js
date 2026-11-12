import { apiFetch } from "./client";

// [{ id, name, group_name, balance_cents, open_since, row_count }],
// largest balance first. See specs/repayment-tabs.
export function listTabs() {
  return apiFetch("/api/tabs/");
}

// One tab plus rows: [{ id, date, payee, notes, amount_cents,
// running_balance_cents, split_parent, parent_amount_cents, kind
// ("lent" | "repaid" | "covered"), covered_category: { id, label } | null }],
// oldest first.
export function getTab(id) {
  return apiFetch(`/api/tabs/${id}/`);
}

// Covered entries: what the tab's person paid for the user. `entry` is
// { date, payee, amount_cents (> 0), category, notes? }. Each returns the
// tab with its rows and `saved_row`, the entry's row id (null on delete).
// A 400 carries field errors in error.data.
export function addCoveredEntry(tabId, entry) {
  return apiFetch(`/api/tabs/${tabId}/covered/`, { method: "POST", body: entry });
}

export function updateCoveredEntry(tabId, rowId, entry) {
  return apiFetch(`/api/tabs/${tabId}/covered/${rowId}/`, { method: "PATCH", body: entry });
}

export function deleteCoveredEntry(tabId, rowId) {
  return apiFetch(`/api/tabs/${tabId}/covered/${rowId}/`, { method: "DELETE" });
}

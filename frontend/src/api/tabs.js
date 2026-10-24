import { apiFetch } from "./client";

// [{ id, name, group_name, balance_cents, open_since, row_count }],
// largest balance first. See specs/repayment-tabs.
export function listTabs() {
  return apiFetch("/api/tabs/");
}

// One tab plus rows: [{ id, date, payee, notes, amount_cents,
// running_balance_cents, split_parent, parent_amount_cents }], oldest first.
export function getTab(id) {
  return apiFetch(`/api/tabs/${id}/`);
}

import { apiFetch } from "./client";

export const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

export function listAccounts() {
  return apiFetch("/api/accounts/");
}

export function createAccount(data) {
  return apiFetch("/api/accounts/", { method: "POST", body: data });
}

export function updateAccount(id, data) {
  return apiFetch(`/api/accounts/${id}/`, { method: "PATCH", body: data });
}

export function archiveAccount(id) {
  return apiFetch(`/api/accounts/${id}/archive/`, { method: "POST" });
}

// Also returns archived accounts, so their ledger stays reachable.
export function getAccount(id) {
  return apiFetch(`/api/accounts/${id}/`);
}

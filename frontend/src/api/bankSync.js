import { apiFetch } from "./client";

// Bank connections in Settings. See specs/bank-sync and banksync/views.py
// for the shapes.
export function getBankSync() {
  return apiFetch("/api/bank-sync/");
}

export function getBanks() {
  return apiFetch("/api/bank-sync/banks/");
}

export function authorizeBank(bankName) {
  return apiFetch("/api/bank-sync/authorize/", { method: "POST", body: { bank_name: bankName } });
}

export function completeBank(code, state) {
  return apiFetch("/api/bank-sync/complete/", { method: "POST", body: { code, state } });
}

export function syncNow() {
  return apiFetch("/api/bank-sync/run/", { method: "POST" });
}

export function disconnectBank(id) {
  return apiFetch(`/api/bank-sync/connections/${id}/`, { method: "DELETE" });
}

export function linkBankAccount(body) {
  return apiFetch("/api/bank-sync/links/", { method: "POST", body });
}

export function unlinkBankAccount(id) {
  return apiFetch(`/api/bank-sync/links/${id}/`, { method: "DELETE" });
}

import { apiFetch } from "./client";

export function listTransactions(params = {}) {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "" && v != null)),
  ).toString();
  return apiFetch(`/api/transactions/${query ? `?${query}` : ""}`);
}

export function createTransaction(data) {
  return apiFetch("/api/transactions/", { method: "POST", body: data });
}

export function updateTransaction(id, data) {
  return apiFetch(`/api/transactions/${id}/`, { method: "PATCH", body: data });
}

export function deleteTransaction(id) {
  return apiFetch(`/api/transactions/${id}/`, { method: "DELETE" });
}

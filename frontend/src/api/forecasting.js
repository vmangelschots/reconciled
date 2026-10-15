import { apiFetch } from "./client";

export function listRecurringTransactions(accountId) {
  return apiFetch(`/api/recurring-transactions/?account=${accountId}`);
}

export function createRecurringTransaction(data) {
  return apiFetch("/api/recurring-transactions/", { method: "POST", body: data });
}

export function updateRecurringTransaction(id, data) {
  return apiFetch(`/api/recurring-transactions/${id}/`, { method: "PATCH", body: data });
}

export function deleteRecurringTransaction(id) {
  return apiFetch(`/api/recurring-transactions/${id}/`, { method: "DELETE" });
}

export function getForecast(accountId, horizonDays) {
  return apiFetch(`/api/forecast/?account=${accountId}&horizon_days=${horizonDays}`);
}

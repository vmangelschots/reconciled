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

// Marks a transaction as a transfer to/from another account; the backend
// links a matching transaction there or creates one. Returns
// { transaction, counterpart }.
export function linkTransfer(id, accountId) {
  return apiFetch(`/api/transactions/${id}/transfer/`, { method: "POST", body: { account: accountId } });
}

export function unlinkTransfer(id) {
  return apiFetch(`/api/transactions/${id}/transfer/`, { method: "DELETE" });
}

// The Review page: unconfirmed guesses grouped by payee and guessed
// category. Returns { groups, uncategorized_count }.
export function getReviewGroups() {
  return apiFetch("/api/transactions/review-groups/");
}

// How many transactions have a guessed category nobody confirmed yet.
// Returns { count }.
export function getReviewCount() {
  return apiFetch("/api/transactions/review-count/");
}

// Confirms the guesses among `ids`; with a category, sets that category on
// them and confirms it. Returns { confirmed_count }.
export function confirmCategories(ids, category) {
  const body = category == null ? { ids } : { ids, category };
  return apiFetch("/api/transactions/confirm-categories/", { method: "POST", body });
}

// Guesses categories from history for uncategorized transactions - all
// accounts, or just one. Returns { categorized_count, attempted_count }.
export function categorizeUncategorized(accountId) {
  const body = accountId == null ? {} : { account: accountId };
  return apiFetch("/api/transactions/categorize/", { method: "POST", body });
}

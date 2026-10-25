import { apiFetch } from "./client";

export function listCategories() {
  return apiFetch("/api/categories/");
}

// isTabGroup: a top-level category whose subcategories are tabs - see
// specs/repayment-tabs.
export function createCategory(name, parent = null, isTabGroup = false) {
  return apiFetch("/api/categories/", { method: "POST", body: { name, parent, is_tab_group: isTabGroup } });
}

// data: { name?, parent?, is_tab_group? }; parent: null clears it (top-level).
export function updateCategory(id, data) {
  return apiFetch(`/api/categories/${id}/`, { method: "PATCH", body: data });
}

export function deleteCategory(id) {
  return apiFetch(`/api/categories/${id}/`, { method: "DELETE" });
}

// month: null for the category's default limit, or "YYYY-MM" to override
// that one month.
export function setCategoryLimit(id, { month, limit_cents }) {
  return apiFetch(`/api/categories/${id}/limit/`, {
    method: "PUT",
    body: { month, limit_cents },
  });
}

// kind: "monthly" | "yearly" | "target" (yearly on a date). amount_cents is
// the monthly default or the yearly amount; due is "MM-DD" for a target.
// Switching to or from monthly removes the other kind's amounts - see
// specs/yearly-budgets.
export function setCategoryBudget(id, { kind, amount_cents, due }) {
  return apiFetch(`/api/categories/${id}/budget/`, {
    method: "PUT",
    body: { kind, amount_cents, due },
  });
}

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

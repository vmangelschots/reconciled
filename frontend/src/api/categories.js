import { apiFetch } from "./client";

export function listCategories() {
  return apiFetch("/api/categories/");
}

export function createCategory(name, parent = null) {
  return apiFetch("/api/categories/", { method: "POST", body: { name, parent } });
}

// data: { name?, parent? } - either or both; parent: null clears it (top-level).
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

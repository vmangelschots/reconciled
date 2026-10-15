import { apiFetch } from "./client";

export function listCategories() {
  return apiFetch("/api/categories/");
}

export function createCategory(name) {
  return apiFetch("/api/categories/", { method: "POST", body: { name } });
}

export function renameCategory(id, name) {
  return apiFetch(`/api/categories/${id}/`, { method: "PATCH", body: { name } });
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

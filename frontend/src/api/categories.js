import { apiFetch } from "./client";

// Read-only for now - the budgets capability (section 4) adds create/
// rename/delete here.
export function listCategories() {
  return apiFetch("/api/categories/");
}

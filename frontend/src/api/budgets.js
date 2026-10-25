import { apiFetch } from "./client";

// month: "YYYY-MM"
export function getBudgetSummary(month) {
  return apiFetch(`/api/budgets/summary/?month=${encodeURIComponent(month)}`);
}

// The budgeting start month: { start_month: "YYYY-MM" | null }.
export function getBudgetSettings() {
  return apiFetch("/api/budgets/settings/");
}

export function setBudgetStartMonth(startMonth) {
  return apiFetch("/api/budgets/settings/", { method: "PUT", body: { start_month: startMonth } });
}

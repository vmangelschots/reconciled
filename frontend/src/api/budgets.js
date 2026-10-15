import { apiFetch } from "./client";

// month: "YYYY-MM"
export function getBudgetSummary(month) {
  return apiFetch(`/api/budgets/summary/?month=${encodeURIComponent(month)}`);
}

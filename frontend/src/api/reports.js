import { apiFetch } from "./client";

// end: "YYYY-MM" - the last of the 12 months returned.
export function getCashFlow(end) {
  return apiFetch(`/api/reports/cash-flow/?end=${encodeURIComponent(end)}`);
}

// month: "YYYY-MM"
export function getCategorySpending(month) {
  return apiFetch(`/api/reports/category-spending/?month=${encodeURIComponent(month)}`);
}

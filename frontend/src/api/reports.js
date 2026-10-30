import { apiFetch } from "./client";

// month: "YYYY-MM"
export function getCategorySpending(month) {
  return apiFetch(`/api/reports/category-spending/?month=${encodeURIComponent(month)}`);
}

// month: "YYYY-MM"
export function getEverydayBalance(month) {
  return apiFetch(`/api/reports/everyday-balance/?month=${encodeURIComponent(month)}`);
}

export function getNetWorth() {
  return apiFetch("/api/reports/net-worth/");
}

// start, end: "YYYY-MM", both included.
export function getSpendingReport(start, end) {
  return apiFetch(`/api/reports/spending/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
}

// The rows behind one report figure. category: an id or "uncategorized";
// direct: only a parent's own rows; income: a figure of money in.
export function getSpendingCell(month, category, { direct = false, income = false } = {}) {
  const query = new URLSearchParams({
    month,
    category,
    ...(direct ? { direct: "1" } : {}),
    ...(income ? { income: "1" } : {}),
  });
  return apiFetch(`/api/reports/spending/transactions/?${query}`);
}

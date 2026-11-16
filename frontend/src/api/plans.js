import { apiFetch } from "./client";

// Year plans - see specs/year-plans. Current is addressed by year; drafts and
// applied plans by id.

export function listPlans(year) {
  return apiFetch(`/api/budgets/plans/?year=${year}`);
}

export function getCurrentPlan(year) {
  return apiFetch(`/api/budgets/plans/current/${year}/`);
}

export function getPlan(id) {
  return apiFetch(`/api/budgets/plans/${id}/`);
}

// { year, copy_of?: id (else Current), name?, from_month? }
export function createPlan(data) {
  return apiFetch("/api/budgets/plans/", { method: "POST", body: data });
}

// { name?, from_month? }
export function updatePlan(id, data) {
  return apiFetch(`/api/budgets/plans/${id}/`, { method: "PATCH", body: data });
}

export function deletePlan(id) {
  return apiFetch(`/api/budgets/plans/${id}/`, { method: "DELETE" });
}

export function duplicatePlan(id) {
  return apiFetch(`/api/budgets/plans/${id}/duplicate/`, { method: "POST" });
}

// { kind, default_cents?, months?: { "12": cents }, amount_cents?, due?: "MM-DD" }
export function setPlanBudget(id, categoryId, data) {
  return apiFetch(`/api/budgets/plans/${id}/categories/${categoryId}/budget/`, { method: "PUT", body: data });
}

export function removePlanBudget(id, categoryId) {
  return apiFetch(`/api/budgets/plans/${id}/categories/${categoryId}/budget/`, { method: "DELETE" });
}

// bills: [{ name, day, amount_cents, from_month?, until_month? }]
export function setPlanBills(id, categoryId, bills) {
  return apiFetch(`/api/budgets/plans/${id}/categories/${categoryId}/bills/`, { method: "PUT", body: { bills } });
}

export function takeCurrentIntoPlan(id, categoryId) {
  return apiFetch(`/api/budgets/plans/${id}/categories/${categoryId}/use-current/`, { method: "POST" });
}

export function addPlanCategory(id, name, parent = null) {
  return apiFetch(`/api/budgets/plans/${id}/categories/`, { method: "POST", body: { name, parent } });
}

// `plan` is a draft's id, or { year } for Current's income.
function incomeBase(plan) {
  return typeof plan === "object" ? `/api/budgets/plans/current/${plan.year}/income/` : `/api/budgets/plans/${plan}/income/`;
}

// { name, amount_cents, per: "month" | "year", extra?: { "5": cents }, category? }
export function addIncomeLine(plan, data) {
  return apiFetch(incomeBase(plan), { method: "POST", body: data });
}

export function updateIncomeLine(plan, lineId, data) {
  return apiFetch(`${incomeBase(plan)}${lineId}/`, { method: "PATCH", body: data });
}

export function deleteIncomeLine(plan, lineId) {
  return apiFetch(`${incomeBase(plan)}${lineId}/`, { method: "DELETE" });
}

export function getIncomeSuggestions() {
  return apiFetch("/api/budgets/plans/income-suggestions/");
}

export function previewApply(id, fromMonth) {
  return apiFetch(`/api/budgets/plans/${id}/apply/?from=${fromMonth}`);
}

export function applyPlan(id, fromMonth) {
  return apiFetch(`/api/budgets/plans/${id}/apply/`, { method: "POST", body: { from_month: fromMonth } });
}

import { apiFetch } from "./client";

export function getForecast(horizonDays) {
  return apiFetch(`/api/forecast/?horizon_days=${horizonDays}`);
}

export function listExpectedItems() {
  return apiFetch("/api/expected-items/");
}

export function getExpectedItemOptions() {
  return apiFetch("/api/expected-items/options/");
}

export function createExpectedItem(data) {
  return apiFetch("/api/expected-items/", { method: "POST", body: data });
}

export function updateExpectedItem(id, data) {
  return apiFetch(`/api/expected-items/${id}/`, { method: "PATCH", body: data });
}

export function deleteExpectedItem(id) {
  return apiFetch(`/api/expected-items/${id}/`, { method: "DELETE" });
}

export function getNetWorthForecast(years) {
  return apiFetch(`/api/forecast/net-worth/?years=${years}`);
}

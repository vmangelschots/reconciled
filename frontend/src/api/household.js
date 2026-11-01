import { apiFetch, ensureCsrfCookie } from "./client";

// The household and who is in it. See specs/households and households/views.py
// for the shapes.
export function getHousehold() {
  return apiFetch("/api/household/");
}

export function switchHousehold(id) {
  return apiFetch("/api/household/switch/", { method: "POST", body: { household: id } });
}

export function leaveHousehold() {
  return apiFetch("/api/household/leave/", { method: "POST" });
}

export function setAiChoice(enabled) {
  return apiFetch("/api/household/ai/", { method: "PUT", body: { enabled } });
}

export function createInvite() {
  return apiFetch("/api/household/invites/", { method: "POST" });
}

export function revokeInvite(id) {
  return apiFetch(`/api/household/invites/${id}/`, { method: "DELETE" });
}

export function changePassword(body) {
  return apiFetch("/api/auth/password/", { method: "POST", body });
}

export function getInvite(token) {
  return apiFetch(`/api/invites/${encodeURIComponent(token)}/`);
}

export async function acceptInvite(token, body) {
  await ensureCsrfCookie();
  return apiFetch(`/api/invites/${encodeURIComponent(token)}/accept/`, { method: "POST", body });
}

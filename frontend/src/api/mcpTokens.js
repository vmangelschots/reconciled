import { apiFetch, apiUrl } from "./client";

// Personal access tokens for MCP clients. See specs/access-tokens and
// backend/mcpserver/views.py for the shapes.
export function listTokens() {
  return apiFetch("/api/mcp-tokens/");
}

/** The new token, with its full `token` - the only time it's returned. */
export function createToken(name) {
  return apiFetch("/api/mcp-tokens/", { method: "POST", body: { name } });
}

export function revokeToken(id) {
  return apiFetch(`/api/mcp-tokens/${id}/`, { method: "DELETE" });
}

export function mcpEndpoint() {
  return apiUrl("/mcp");
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/**
 * Minimal fetch wrapper for the Django API: always sends the session
 * cookie, and attaches the CSRF token header Django's CsrfViewMiddleware
 * requires on any unsafe method. Call ensureCsrfCookie() once (e.g. on
 * app load) before the first POST/PUT/PATCH/DELETE.
 */
export async function apiFetch(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCookie("csrftoken");
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.detail || `Request to ${path} failed`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export function ensureCsrfCookie() {
  return apiFetch("/api/auth/csrf/");
}

/**
 * Like apiFetch, but for multipart/form-data uploads - the browser must
 * set its own Content-Type (with the multipart boundary), so this never
 * sets one itself.
 */
export async function apiUpload(path, formData) {
  const headers = {};
  const csrfToken = readCookie("csrftoken");
  if (csrfToken) headers["X-CSRFToken"] = csrfToken;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: formData,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.detail || `Request to ${path} failed`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

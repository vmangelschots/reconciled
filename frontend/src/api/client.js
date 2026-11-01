// An empty VITE_API_BASE_URL means same-origin (the published images are
// built that way and served behind one Ingress); unset keeps the local
// development default.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// The household this page loaded, sent with every request so a tab left on
// another household can't change this one. See specs/households.
let household = null;

export function setActiveHousehold(id) {
  household = id;
}

const NOTICE_KEY = "reconciled.notice";

function householdHeader() {
  return household === null ? {} : { "X-Household": String(household) };
}

function reloadIfHouseholdChanged(response) {
  if (response.status !== 409) return;
  try {
    window.sessionStorage.setItem(NOTICE_KEY, "Your household changed, so this page reloaded.");
  } catch {
    // Blocked storage: it just reloads without saying why.
  }
  window.location.assign("/");
}

/** A message left by a reload, once. */
export function takeNotice() {
  try {
    const notice = window.sessionStorage.getItem(NOTICE_KEY);
    window.sessionStorage.removeItem(NOTICE_KEY);
    return notice;
  } catch {
    return null;
  }
}

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
  const headers = { "Content-Type": "application/json", ...householdHeader() };
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
  reloadIfHouseholdChanged(response);

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
  const headers = householdHeader();
  const csrfToken = readCookie("csrftoken");
  if (csrfToken) headers["X-CSRFToken"] = csrfToken;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: formData,
  });
  reloadIfHouseholdChanged(response);

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.detail || `Request to ${path} failed`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

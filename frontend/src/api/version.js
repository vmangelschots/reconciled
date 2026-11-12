import { apiFetch } from "./client";

// The running backend build: { version, commit, built }. See core/version.py.
export function fetchServerVersion() {
  return apiFetch("/api/version/");
}

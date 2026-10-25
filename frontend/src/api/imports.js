import { apiFetch, apiUpload } from "./client";

export function uploadImportFile(accountId, file) {
  const formData = new FormData();
  formData.append("account", accountId);
  formData.append("file", file);
  return apiUpload("/api/import-sessions/", formData);
}

export function mapCsvColumns(sessionId, mapping) {
  return apiFetch(`/api/import-sessions/${sessionId}/map/`, {
    method: "POST",
    body: mapping,
  });
}

// Revolut with several Products: { product: accountId | null } (null skips it).
export function assignProducts(sessionId, productAccounts) {
  return apiFetch(`/api/import-sessions/${sessionId}/assign/`, {
    method: "POST",
    body: { product_accounts: productAccounts },
  });
}

export function commitImport(sessionId, selectedIndices) {
  return apiFetch(`/api/import-sessions/${sessionId}/commit/`, {
    method: "POST",
    body: { selected_indices: selectedIndices },
  });
}

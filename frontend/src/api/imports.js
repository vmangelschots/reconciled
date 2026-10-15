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

export function commitImport(sessionId, selectedIndices) {
  return apiFetch(`/api/import-sessions/${sessionId}/commit/`, {
    method: "POST",
    body: { selected_indices: selectedIndices },
  });
}

import { apiFetch } from "./client";

// Every overview figure for one account and month ("YYYY-MM"). See
// specs/overview and reports.views.OverviewView for the shape.
export function getOverview(month, accountId) {
  return apiFetch(`/api/reports/overview/?month=${encodeURIComponent(month)}&account=${accountId}`);
}

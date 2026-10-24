import { apiFetch } from "./client";

// Every overview figure for one month ("YYYY-MM") across all active
// accounts. See specs/overview and reports.views.OverviewView for the shape.
export function getOverview(month) {
  return apiFetch(`/api/reports/overview/?month=${encodeURIComponent(month)}`);
}

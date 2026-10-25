import { apiFetch } from "./client";

// Each type belongs to a tier, from most to least liquid - see the
// accounts spec's "Account tiers". Listed in tier order.
export const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking", tier: "everyday" },
  { value: "cash", label: "Cash", tier: "everyday" },
  { value: "credit_card", label: "Credit Card", tier: "everyday" },
  { value: "other", label: "Other (everyday)", tier: "everyday" },
  { value: "savings", label: "Savings", tier: "savings" },
  { value: "investment", label: "Investment", tier: "investments" },
  { value: "property", label: "Property", tier: "property" },
  { value: "loan", label: "Loan", tier: "loans" },
];

export const TIERS = [
  { value: "everyday", label: "Everyday" },
  { value: "savings", label: "Savings" },
  { value: "investments", label: "Investments" },
  { value: "property", label: "Property" },
  { value: "loans", label: "Loans" },
];

export function tierLabel(tier) {
  return TIERS.find((t) => t.value === tier)?.label ?? tier;
}

// Types whose value is set by hand - see the value-adjustments spec.
export const VALUED_TYPES = new Set(["investment", "property", "loan"]);

export function listAccounts() {
  return apiFetch("/api/accounts/");
}

export function createAccount(data) {
  return apiFetch("/api/accounts/", { method: "POST", body: data });
}

export function updateAccount(id, data) {
  return apiFetch(`/api/accounts/${id}/`, { method: "PATCH", body: data });
}

export function archiveAccount(id) {
  return apiFetch(`/api/accounts/${id}/archive/`, { method: "POST" });
}

// Also returns archived accounts, so their ledger stays reachable.
export function getAccount(id) {
  return apiFetch(`/api/accounts/${id}/`);
}

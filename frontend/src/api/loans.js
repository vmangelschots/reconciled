import { apiFetch } from "./client";

// A loan account's terms and schedule - see the loan-schedules spec. Each
// call that changes something returns the schedule as it now stands.

export function getLoan(accountId) {
  return apiFetch(`/api/accounts/${accountId}/loan/`);
}

export function saveLoan(accountId, terms) {
  return apiFetch(`/api/accounts/${accountId}/loan/`, { method: "PUT", body: terms });
}

export function removeLoan(accountId) {
  return apiFetch(`/api/accounts/${accountId}/loan/`, { method: "DELETE" });
}

// What the terms would give, saving nothing: the payment, the next
// installment, the balance per schedule today, recent payments found in
// the paying account and, when editing, what saving would repost.
export function previewLoan(accountId, terms) {
  return apiFetch(`/api/accounts/${accountId}/loan/preview/`, { method: "POST", body: terms });
}

export function listPaymentCandidates(accountId, number) {
  return apiFetch(`/api/accounts/${accountId}/loan/installments/${number}/candidates/`);
}

export function linkPayment(accountId, number, transactionId) {
  return apiFetch(`/api/accounts/${accountId}/loan/installments/${number}/link/`, {
    method: "POST",
    body: { transaction: transactionId },
  });
}

export function unlinkPayment(accountId, number) {
  return apiFetch(`/api/accounts/${accountId}/loan/installments/${number}/link/`, { method: "DELETE" });
}

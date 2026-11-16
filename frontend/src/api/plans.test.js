import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));

import { apiFetch } from "./client";
import {
  addIncomeLine,
  addPlanCategory,
  applyPlan,
  createPlan,
  deleteIncomeLine,
  deletePlan,
  duplicatePlan,
  getCurrentPlan,
  getIncomeSuggestions,
  getPlan,
  listPlans,
  previewApply,
  removePlanBudget,
  setPlanBills,
  setPlanBudget,
  updateIncomeLine,
  updatePlan,
  takeCurrentIntoPlan,
} from "./plans";

describe("plans API", () => {
  beforeEach(() => apiFetch.mockClear());

  it("reads plans", async () => {
    await listPlans(2027);
    await getCurrentPlan(2027);
    await getPlan(4);
    await getIncomeSuggestions();
    await previewApply(4, 7);
    expect(apiFetch.mock.calls.map((call) => call[0])).toEqual([
      "/api/budgets/plans/?year=2027",
      "/api/budgets/plans/current/2027/",
      "/api/budgets/plans/4/",
      "/api/budgets/plans/income-suggestions/",
      "/api/budgets/plans/4/apply/?from=7",
    ]);
  });

  it("makes and changes drafts", async () => {
    await createPlan({ year: 2027, copy_of: 3 });
    await updatePlan(4, { from_month: 9 });
    await deletePlan(4);
    await duplicatePlan(4);
    await applyPlan(4, 7);
    expect(apiFetch.mock.calls).toEqual([
      ["/api/budgets/plans/", { method: "POST", body: { year: 2027, copy_of: 3 } }],
      ["/api/budgets/plans/4/", { method: "PATCH", body: { from_month: 9 } }],
      ["/api/budgets/plans/4/", { method: "DELETE" }],
      ["/api/budgets/plans/4/duplicate/", { method: "POST" }],
      ["/api/budgets/plans/4/apply/", { method: "POST", body: { from_month: 7 } }],
    ]);
  });

  it("edits a draft's budgets", async () => {
    await setPlanBudget(4, 9, { kind: "monthly", default_cents: 60000, months: { 12: 80000 } });
    await removePlanBudget(4, 9);
    await setPlanBills(4, 9, [{ name: "Gym", day: 1, amount_cents: 3000, until_month: 12 }]);
    await takeCurrentIntoPlan(4, 9);
    await addPlanCategory(4, "Car fund");
    expect(apiFetch.mock.calls).toEqual([
      ["/api/budgets/plans/4/categories/9/budget/", { method: "PUT", body: { kind: "monthly", default_cents: 60000, months: { 12: 80000 } } }],
      ["/api/budgets/plans/4/categories/9/budget/", { method: "DELETE" }],
      ["/api/budgets/plans/4/categories/9/bills/", { method: "PUT", body: { bills: [{ name: "Gym", day: 1, amount_cents: 3000, until_month: 12 }] } }],
      ["/api/budgets/plans/4/categories/9/use-current/", { method: "POST" }],
      ["/api/budgets/plans/4/categories/", { method: "POST", body: { name: "Car fund", parent: null } }],
    ]);
  });

  it("edits income on Current and in drafts", async () => {
    await addIncomeLine({ year: 2027 }, { name: "Salary", amount_cents: 320000, per: "month" });
    await updateIncomeLine(4, 7, { amount_cents: 330000 });
    await deleteIncomeLine({ year: 2027 }, 7);
    expect(apiFetch.mock.calls).toEqual([
      ["/api/budgets/plans/current/2027/income/", { method: "POST", body: { name: "Salary", amount_cents: 320000, per: "month" } }],
      ["/api/budgets/plans/4/income/7/", { method: "PATCH", body: { amount_cents: 330000 } }],
      ["/api/budgets/plans/current/2027/income/7/", { method: "DELETE" }],
    ]);
  });
});

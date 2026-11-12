import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));

import { apiFetch } from "./client";
import { addBillFromPayment, setCategoryBills, setCategoryBudget } from "./categories";

describe("bills API", () => {
  beforeEach(() => apiFetch.mockClear());

  it("switches a category to bills without an amount", async () => {
    await setCategoryBudget(4, { kind: "bills" });
    expect(apiFetch).toHaveBeenCalledWith("/api/categories/4/budget/", {
      method: "PUT",
      body: { kind: "bills", amount_cents: undefined, due: undefined },
    });
  });

  it("replaces the bills", async () => {
    const bills = [{ id: 1, name: "Netflix", day: 5, amount_cents: 1799 }, { name: "Spotify", day: 21, amount_cents: 1099 }];
    await setCategoryBills(4, bills, "2026-11");
    expect(apiFetch).toHaveBeenCalledWith("/api/categories/4/bills/", { method: "PUT", body: { month: "2026-11", bills } });
  });

  it("adds a payment as a bill", async () => {
    await addBillFromPayment(4, 91, "Apple TV");
    expect(apiFetch).toHaveBeenCalledWith("/api/categories/4/bills/from-payment/", {
      method: "POST",
      body: { transaction: 91, name: "Apple TV" },
    });
  });
});

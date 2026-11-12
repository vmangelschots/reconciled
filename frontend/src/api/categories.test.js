import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));

import { apiFetch } from "./client";
import { setCategoryBills, setCategoryBudget } from "./categories";

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
    await setCategoryBills(4, bills);
    expect(apiFetch).toHaveBeenCalledWith("/api/categories/4/bills/", { method: "PUT", body: { bills } });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ apiFetch: vi.fn().mockResolvedValue({}) }));

import { apiFetch } from "./client";
import { categorizeUncategorized, confirmCategories, getReviewCount, getReviewGroups } from "./transactions";

describe("review API", () => {
  beforeEach(() => apiFetch.mockClear());

  it("fetches the review groups and count", async () => {
    await getReviewGroups();
    await getReviewCount();

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/transactions/review-groups/");
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/transactions/review-count/");
  });

  it("confirms ids, with or without a category", async () => {
    await confirmCategories([1, 2]);
    await confirmCategories([3], 7);

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/transactions/confirm-categories/", {
      method: "POST",
      body: { ids: [1, 2] },
    });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/transactions/confirm-categories/", {
      method: "POST",
      body: { ids: [3], category: 7 },
    });
  });

  it("categorizes all accounts or one", async () => {
    await categorizeUncategorized();
    await categorizeUncategorized(4);

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/transactions/categorize/", { method: "POST", body: {} });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/api/transactions/categorize/", {
      method: "POST",
      body: { account: 4 },
    });
  });
});

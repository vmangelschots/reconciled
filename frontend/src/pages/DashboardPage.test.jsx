import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import { ToastProvider } from "../components/ui/Toast";
import * as reportsApi from "../api/reports";

vi.mock("../api/reports", () => ({ getCashFlow: vi.fn(), getCategorySpending: vi.fn() }));

const CASH_FLOW = {
  months: Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, "0")}`,
    in_cents: 100000,
    out_cents: 80000,
  })),
};

function spending(month) {
  return {
    month,
    categories: [{ category_id: 1, name: `Groceries ${month}`, spent_cents: 5000, direct_cents: 5000, subcategories: [] }],
    uncategorized_cents: 0,
  };
}

function renderPage() {
  return render(
    <ToastProvider>
      <DashboardPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16)); // 16 October 2026, local time
  vi.clearAllMocks();
  reportsApi.getCashFlow.mockResolvedValue(CASH_FLOW);
  reportsApi.getCategorySpending.mockImplementation((month) => Promise.resolve(spending(month)));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DashboardPage", () => {
  it("loads both charts for the browser's current month", async () => {
    renderPage();
    expect(await screen.findByRole("img", { name: /Money in vs money out/ })).toBeInTheDocument();
    expect(await screen.findByText("Groceries 2026-10")).toBeInTheDocument();
    expect(reportsApi.getCashFlow).toHaveBeenCalledWith("2026-10");
    expect(reportsApi.getCategorySpending).toHaveBeenCalledWith("2026-10");
    expect(screen.getByText("October 2026")).toBeInTheDocument();
  });

  it("disables next month on the current month", async () => {
    renderPage();
    await screen.findByText("Groceries 2026-10");
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("previous month refetches that month and enables next", async () => {
    renderPage();
    await screen.findByText("Groceries 2026-10");

    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));

    expect(await screen.findByText("Groceries 2026-09")).toBeInTheDocument();
    expect(reportsApi.getCategorySpending).toHaveBeenLastCalledWith("2026-09");
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
    expect(reportsApi.getCashFlow).toHaveBeenCalledTimes(1);
  });

  it("navigates across a year boundary", async () => {
    vi.setSystemTime(new Date(2026, 0, 5));
    renderPage();
    await screen.findByText("Groceries 2026-01");
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await screen.findByText("Groceries 2025-12")).toBeInTheDocument();
  });

  it("keeps the in/out chart when category spending fails to load", async () => {
    reportsApi.getCategorySpending.mockRejectedValue(new Error("Server exploded"));
    renderPage();

    expect(await screen.findByText("Couldn't load spending per category.")).toBeInTheDocument();
    expect(screen.getByText("Server exploded")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: /Money in vs money out/ })).toBeInTheDocument();
  });

  it("shows a loading state until data arrives", async () => {
    reportsApi.getCashFlow.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText("Groceries 2026-10")).toBeInTheDocument());
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ReportsPage } from "./ReportsPage";
import { ToastProvider } from "../components/ui/Toast";
import { AccountsProvider } from "../accounts/AccountsContext";
import * as accountsApi from "../api/accounts";
import * as categoriesApi from "../api/categories";
import * as reportsApi from "../api/reports";
import { report } from "../test/spendingReportFixture";

vi.mock("../api/accounts", () => ({ listAccounts: vi.fn() }));
vi.mock("../api/categories", () => ({ listCategories: vi.fn() }));
vi.mock("../api/reports", () => ({ getSpendingReport: vi.fn(), getSpendingCell: vi.fn() }));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.search}</p>;
}

function renderPage(path = "/reports") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AccountsProvider>
          <Routes>
            <Route
              path="/reports"
              element={
                <>
                  <ReportsPage />
                  <Where />
                </>
              }
            />
          </Routes>
        </AccountsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 24, 12));
  vi.clearAllMocks();
  accountsApi.listAccounts.mockResolvedValue([{ id: 1, name: "Joint", current_balance_cents: 0, archived: false }]);
  categoriesApi.listCategories.mockResolvedValue([]);
  reportsApi.getSpendingReport.mockResolvedValue(report());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ReportsPage", () => {
  it("opens on the last 12 complete months", async () => {
    renderPage();
    await screen.findByText(/All accounts/);
    expect(reportsApi.getSpendingReport).toHaveBeenCalledWith("2025-10", "2026-09");
    expect(screen.getByRole("button", { name: "12 months" })).toHaveAttribute("aria-pressed", "true");
  });

  it("says what the period covers, and sums it up", async () => {
    renderPage();
    expect(await screen.findByText(/All accounts · Excludes transfers and tabs/)).toBeInTheDocument();
    expect(screen.getByText("Spent €1,800 · Income €6,000 · Saved 70%")).toBeInTheDocument();
  });

  it("keeps the picked period in the address", async () => {
    renderPage();
    await screen.findByText(/All accounts/);
    await userEvent.click(screen.getByRole("button", { name: "Last year" }));
    expect(screen.getByTestId("where")).toHaveTextContent("?period=last-year");
    await waitFor(() => expect(reportsApi.getSpendingReport).toHaveBeenLastCalledWith("2025-01", "2025-12"));
  });

  it("reads the period from the address on a reload", async () => {
    renderPage("/reports?period=last-year");
    await screen.findByText(/All accounts/);
    expect(reportsApi.getSpendingReport).toHaveBeenCalledWith("2025-01", "2025-12");
    expect(screen.getByRole("button", { name: "Last year" })).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to the default on a bad address", async () => {
    renderPage("/reports?from=nonsense&to=2026-01");
    await screen.findByText(/All accounts/);
    expect(reportsApi.getSpendingReport).toHaveBeenCalledWith("2025-10", "2026-09");
  });

  it("offers From and To for a custom period", async () => {
    renderPage();
    await screen.findByText(/All accounts/);
    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    expect(screen.getByRole("combobox", { name: "From" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "To" })).toBeInTheDocument();
  });

  it("switches the chart to In vs out, following the period", async () => {
    renderPage();
    await screen.findByText(/All accounts/);
    await userEvent.click(screen.getByRole("button", { name: "In vs out" }));
    expect(screen.getByRole("img", { name: /Money in vs money out over the last 2 months/ })).toBeInTheDocument();
  });

  it("warns about a large uncategorized share", async () => {
    const base = report();
    reportsApi.getSpendingReport.mockResolvedValue(
      report({
        uncategorized: { ...base.uncategorized, total_cents: 62000 },
        spending: { ...base.spending, total_cents: 440000 },
      }),
    );
    renderPage();
    expect(await screen.findByText(/€620 uncategorized \(14%\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute("href", "/review");
  });

  it("doesn't warn about a small one", async () => {
    renderPage();
    await screen.findByText(/All accounts/);
    expect(screen.queryByRole("link", { name: "Review" })).toBeNull();
  });

  it("links to Accounts without accounts", async () => {
    accountsApi.listAccounts.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByRole("link", { name: "Go to Accounts" })).toHaveAttribute("href", "/accounts");
  });

  it("offers Import without transactions", async () => {
    reportsApi.getSpendingReport.mockResolvedValue({ has_data: false, months: [], current_month: "2026-10" });
    renderPage();
    expect(await screen.findByRole("link", { name: "Go to Import" })).toHaveAttribute("href", "/import");
  });

  it("shows the month so far in the first weeks", async () => {
    reportsApi.getSpendingReport.mockImplementation(async (start) =>
      start === "2026-10"
        ? report({ months: ["2026-10"], full_months: [] })
        : { has_data: true, months: [], current_month: "2026-10" },
    );
    renderPage();
    expect(await screen.findByText(/useful after your first full month/)).toBeInTheDocument();
    expect(reportsApi.getSpendingReport).toHaveBeenCalledWith("2026-10", "2026-10");
  });

  it("says so when a chosen period is empty", async () => {
    reportsApi.getSpendingReport.mockResolvedValue({ has_data: true, months: [], current_month: "2026-10" });
    renderPage("/reports?period=last-year");
    expect(await screen.findByText("No data in this period.")).toBeInTheDocument();
  });

  it("keeps the old figures, dimmed, while a new period loads", async () => {
    renderPage();
    await screen.findByText(/All accounts/);
    reportsApi.getSpendingReport.mockReturnValue(new Promise(() => {}));
    await userEvent.click(screen.getByRole("button", { name: "Last year" }));
    const table = await screen.findByRole("region", { name: "Profit and loss" });
    expect(within(table).getByText("Groceries")).toBeInTheDocument();
    expect(table.parentElement).toHaveClass("opacity-60");
  });

  it("says so when the report can't load", async () => {
    reportsApi.getSpendingReport.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText("Couldn't load the report.")).toBeInTheDocument();
  });

  it("opens the sheet from a table cell", async () => {
    reportsApi.getSpendingCell.mockResolvedValue({
      month: "2026-08",
      name: "Groceries",
      uncategorized: false,
      total_cents: 41200,
      accounts: [],
      rows: [],
    });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "€412" }));
    expect(reportsApi.getSpendingCell).toHaveBeenCalledWith("2026-08", 1, expect.objectContaining({ month: "2026-08" }));
  });
});

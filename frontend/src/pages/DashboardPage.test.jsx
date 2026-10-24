import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";
import { ToastProvider } from "../components/ui/Toast";
import * as reportsApi from "../api/reports";
import * as tabsApi from "../api/tabs";
import { formatMoney } from "../lib/money";

vi.mock("../api/reports", () => ({ getCashFlow: vi.fn(), getCategorySpending: vi.fn() }));
vi.mock("../api/tabs", () => ({ listTabs: vi.fn() }));

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
    <MemoryRouter>
      <ToastProvider>
        <DashboardPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16)); // 16 October 2026, local time
  vi.clearAllMocks();
  reportsApi.getCashFlow.mockResolvedValue(CASH_FLOW);
  reportsApi.getCategorySpending.mockImplementation((month) => Promise.resolve(spending(month)));
  tabsApi.listTabs.mockResolvedValue([]);
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

describe("DashboardPage open tabs", () => {
  const tab = (id, name, balance_cents, open_since) => ({
    id,
    name,
    group_name: "Tabs",
    balance_cents,
    open_since,
    row_count: 1,
  });

  it("lists open tabs with their sentence and age, settled ones collapsed", async () => {
    tabsApi.listTabs.mockResolvedValue([
      tab(12, "Employer", 41250, "2026-09-01"),
      tab(11, "Jan", 3000, "2026-10-03"),
      tab(13, "Piet", 0, null),
    ]);
    renderPage();

    const card = (await screen.findByText("Open tabs")).closest("div.rounded-lg");
    const links = within(card).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining(`Employer owes you ${formatMoney(41250)}`),
      expect.stringContaining(`Jan owes you ${formatMoney(3000)}`),
    ]);
    // 1 Sep is more than 30 days before 16 Oct; 3 Oct isn't.
    expect(within(links[0]).getByText(/open since/)).toHaveClass("text-warning");
    expect(within(links[1]).getByText(/open since/)).toHaveClass("text-ink-muted");
    expect(within(links[0]).getByText(/owes you/)).not.toHaveClass("text-success");

    await userEvent.click(within(card).getByRole("button", { name: /1 settled tab/ }));
    expect(within(card).getByText("Piet · Settled")).toBeInTheDocument();
  });

  it("says when everything is settled", async () => {
    tabsApi.listTabs.mockResolvedValue([tab(11, "Jan", 0, null)]);
    renderPage();

    expect(await screen.findByText("All tabs are settled.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 settled tab/ })).toBeInTheDocument();
  });

  it("shows no card without tabs", async () => {
    renderPage();
    await screen.findByText("Groceries 2026-10");

    expect(screen.queryByText("Open tabs")).toBeNull();
  });

  it("links each tab to its page", async () => {
    tabsApi.listTabs.mockResolvedValue([tab(11, "Jan", 3000, "2026-10-03")]);
    renderPage();

    expect(await screen.findByRole("link", { name: /Jan owes you/ })).toHaveAttribute("href", "/tabs/11");
  });

  it("says what the in vs out chart leaves out", async () => {
    renderPage();

    expect(await screen.findByText("Excludes transfers and tabs")).toBeInTheDocument();
  });
});

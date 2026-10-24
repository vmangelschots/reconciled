import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { OverviewPage } from "./OverviewPage";
import { ToastProvider } from "../components/ui/Toast";
import { AccountsProvider } from "../accounts/AccountsContext";
import * as accountsApi from "../api/accounts";
import * as overviewApi from "../api/overview";
import * as reportsApi from "../api/reports";
import * as tabsApi from "../api/tabs";
import { formatMoney } from "../lib/money";

vi.mock("../api/accounts", () => ({ listAccounts: vi.fn() }));
vi.mock("../api/overview", () => ({ getOverview: vi.fn() }));
vi.mock("../api/reports", () => ({ getCashFlow: vi.fn(), getCategorySpending: vi.fn() }));
vi.mock("../api/tabs", () => ({ listTabs: vi.fn() }));

const JOINT = { id: 1, name: "Joint", current_balance_cents: 348217, archived: false };
const SAVINGS = { id: 2, name: "Savings", current_balance_cents: 1000000, archived: false };

// whole euros, as the tiles show them
const eur = (cents) => formatMoney(cents).replace(/[.,]00$/, "");

function overview(overrides = {}) {
  const base = {
    month: "2026-10",
    balance_cents: 348200,
    accounts: [{ id: 1, name: "Joint", balance_cents: 348200, last_import_date: "2026-10-22" }],
    in_out: { in_cents: 240000, out_cents: 119000 },
    budget: {
      has_limits: true,
      limit_cents: 260000,
      spent_cents: 194000,
      outside_cents: 12000,
      uncategorized_cents: 21300,
      pace: 24 / 31,
      days_left: 8,
    },
    attention: { review_count: 0, uncategorized_count: 0, categories: [] },
    recent: [],
  };
  return {
    ...base,
    ...overrides,
    budget: { ...base.budget, ...overrides.budget },
    attention: { ...base.attention, ...overrides.attention },

  };
}

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

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ToastProvider>
        <AccountsProvider>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </AccountsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function panel(name) {
  return screen.getByRole("region", { name });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 24, 12)); // 24 October 2026, local time
  vi.clearAllMocks();
  window.localStorage.clear();
  accountsApi.listAccounts.mockResolvedValue([JOINT]);
  overviewApi.getOverview.mockResolvedValue(overview());
  reportsApi.getCashFlow.mockResolvedValue(CASH_FLOW);
  reportsApi.getCategorySpending.mockImplementation((month) => Promise.resolve(spending(month)));
  tabsApi.listTabs.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Overview month", () => {
  it("opens on this month for all accounts, with no account picker", async () => {
    accountsApi.listAccounts.mockResolvedValue([JOINT, SAVINGS]);
    renderPage();

    expect(await screen.findByText(/^Oct(ober)? 2026$/)).toBeInTheDocument();
    await waitFor(() => expect(overviewApi.getOverview).toHaveBeenCalledWith("2026-10"));
    expect(reportsApi.getCashFlow).toHaveBeenCalledWith("2026-10");
    expect(reportsApi.getCategorySpending).toHaveBeenCalledWith("2026-10");
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
    expect(screen.queryByRole("combobox", { name: "Account" })).toBeNull();
  });

  it("points to Accounts when there are none", async () => {
    accountsApi.listAccounts.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("There are no accounts yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Accounts" })).toHaveAttribute("href", "/accounts");
    expect(overviewApi.getOverview).not.toHaveBeenCalled();
  });

  it("offers Import in the header", async () => {
    renderPage();

    expect(await screen.findByRole("link", { name: "Import" })).toHaveAttribute("href", "/import");
  });
});

describe("Accounts tile", () => {
  const TWO = [
    { id: 1, name: "Revolut", balance_cents: 214000, last_import_date: "2026-10-21" },
    { id: 2, name: "Crelan", balance_cents: 134200, last_import_date: "2026-10-12" },
  ];

  it("lists each account with its balance and import freshness", async () => {
    overviewApi.getOverview.mockResolvedValue(overview({ accounts: TWO, balance_cents: 348200 }));
    renderPage();
    const tile = await screen.findByRole("region", { name: "Accounts" });

    const rows = await within(tile).findAllByRole("link");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(new RegExp(`Revolut.*imported 3 days ago.*${eur(214000)}`)),
      expect.stringMatching(new RegExp(`Crelan.*imported 12 days ago.*${eur(134200)}`)),
    ]);
    expect(within(rows[0]).getByText("imported 3 days ago")).not.toHaveClass("text-warning");
    expect(within(rows[1]).getByText("imported 12 days ago")).toHaveClass("text-warning");
    expect(rows.map((r) => r.getAttribute("href"))).toEqual(["/transactions/1", "/transactions/2"]);
  });

  it("says when an account was never imported", async () => {
    overviewApi.getOverview.mockResolvedValue(
      overview({ accounts: [{ id: 3, name: "Savings", balance_cents: 0, last_import_date: null }] }),
    );
    renderPage();
    const tile = await screen.findByRole("region", { name: "Accounts" });

    expect(await within(tile).findByText("No imports yet")).toHaveClass("text-warning");
  });
});

describe("Balance tile", () => {
  it("shows the balance and this month's change", async () => {
    renderPage();
    const tile = await screen.findByRole("region", { name: "Balance" });

    await waitFor(() => expect(tile).toHaveTextContent(eur(348200)));
    expect(within(tile).getByText(/this month/)).toHaveTextContent(`+${eur(121000)} this month`);
    expect(within(tile).getByText(/this month/)).toHaveClass("text-positive");
  });

  it("labels a past month", async () => {
    overviewApi.getOverview.mockImplementation((month) =>
      Promise.resolve(month === "2026-09" ? overview({ in_out: { in_cents: 240000, out_cents: 210000 } }) : overview()),
    );
    renderPage();
    await screen.findByText(/this month/);

    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));

    const tile = panel("Balance");
    expect(await within(tile).findByText(/in September/)).toHaveTextContent(`+${eur(30000)} in September`);
    expect(within(tile).getByText("· Today")).toBeInTheDocument();
  });
});

describe("Budget tile", () => {
  it("shows budgeted spending, pace, what's left and spending outside budgets", async () => {
    renderPage();
    const tile = await screen.findByRole("region", { name: "Budget" });

    await waitFor(() => expect(tile).toHaveTextContent(`${eur(194000)} of ${eur(260000)}`));
    expect(tile).toHaveTextContent(`${eur(66000)} left · ${eur(8200)} a day`);
    expect(tile).toHaveTextContent(`+${eur(12000)} outside budgets · ${eur(21300)} uncategorized`);
    expect(within(tile).getByTestId("progress-marker").style.left).toBe(`${(24 / 31) * 100}%`);
  });

  it("says how much over, in the critical colour", async () => {
    overviewApi.getOverview.mockResolvedValue(overview({ budget: { spent_cents: 275000 } }));
    renderPage();
    const tile = await screen.findByRole("region", { name: "Budget" });

    expect(await within(tile).findByText(`${eur(15000)} over`)).toHaveClass("text-critical");
    expect(within(tile).getByTestId("progress-fill")).toHaveClass("bg-critical");
  });

  it("has no pace for a past month", async () => {
    overviewApi.getOverview.mockImplementation((month) =>
      Promise.resolve(month === "2026-09" ? overview({ budget: { pace: null, days_left: null } }) : overview()),
    );
    renderPage();
    await screen.findByText(/a day/);

    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));

    const tile = panel("Budget");
    await waitFor(() => expect(tile).not.toHaveTextContent("a day"));
    expect(within(tile).queryByTestId("progress-marker")).toBeNull();
  });

  it("offers to set budgets when there are none", async () => {
    overviewApi.getOverview.mockResolvedValue(
      overview({ budget: { has_limits: false, limit_cents: 0, spent_cents: 0, outside_cents: 50000, uncategorized_cents: 0 } }),
    );
    renderPage();
    const tile = await screen.findByRole("region", { name: "Budget" });

    expect(await within(tile).findByRole("link", { name: /Set budgets/ })).toHaveAttribute("href", "/budgets");
    expect(tile).toHaveTextContent(eur(50000));
  });
});

describe("Needs attention", () => {
  it("lists everything in order, with links", async () => {
    overviewApi.getOverview.mockResolvedValue(
      overview({
        accounts: [
          { id: 1, name: "Revolut", balance_cents: 0, last_import_date: "2026-10-21" },
          { id: 2, name: "Crelan", balance_cents: 0, last_import_date: "2026-10-12" },
        ],
        attention: {
          review_count: 12,
          uncategorized_count: 4,
          categories: [
            { id: 5, name: "Groceries", parent_name: null, spent_cents: 41200, limit_cents: 35000, share: 117, over: true },
            { id: 6, name: "Restaurants", parent_name: null, spent_cents: 18000, limit_cents: 20000, share: 90, over: false },
          ],
        },
      }),
    );
    renderPage();
    const attention = await screen.findByRole("region", { name: "Needs attention" });

    await waitFor(() => expect(within(attention).getAllByRole("link")).toHaveLength(5));
    const links = within(attention).getAllByRole("link");
    expect(links.map((l) => l.textContent.split(/(?<=[a-z%)])(?=[A-Z€])/)[0])).toEqual([
      "12 guesses to review",
      `4 uncategorized (${eur(21300)} this month)`,
      `Groceries ${eur(6200)} over`,
      "Restaurants at 90%",
      "Crelan: last import 12 days ago",
    ]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/review",
      "/review",
      "/budgets?month=2026-10",
      "/budgets?month=2026-10",
      "/import?account=2",
    ]);
  });

  it("opens Budgets on the month being viewed", async () => {
    overviewApi.getOverview.mockImplementation((month) =>
      Promise.resolve(
        overview({
          attention: {
            categories:
              month === "2026-09"
                ? [{ id: 5, name: "Groceries", parent_name: null, spent_cents: 38000, limit_cents: 35000, share: 108, over: true }]
                : [],
          },
        }),
      ),
    );
    renderPage();
    await screen.findByText("Everything is in order.");
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));

    await userEvent.click(await screen.findByRole("link", { name: /Groceries .* over/ }));

    expect(screen.getByTestId("where")).toHaveTextContent("/budgets?month=2026-09");
  });

  it("says everything is in order on one line", async () => {
    renderPage();

    expect(await screen.findByText("Everything is in order.")).toBeInTheDocument();
  });

  it("reminds about one stale account by name, several by count, and none when fresh", async () => {
    overviewApi.getOverview.mockResolvedValue(
      overview({ accounts: [{ id: 1, name: "Joint", balance_cents: 0, last_import_date: null }] }),
    );
    const { unmount } = renderPage();
    expect(await screen.findByRole("link", { name: /Joint: no imports yet/ })).toHaveAttribute(
      "href",
      "/import?account=1",
    );
    unmount();

    overviewApi.getOverview.mockResolvedValue(
      overview({
        accounts: [
          { id: 1, name: "Revolut", balance_cents: 0, last_import_date: "2026-10-15" },
          { id: 2, name: "Crelan", balance_cents: 0, last_import_date: null },
        ],
      }),
    );
    const second = renderPage();
    expect(await screen.findByRole("link", { name: /2 accounts not imported this week/ })).toHaveAttribute(
      "href",
      "/import?account=2",
    );
    second.unmount();

    overviewApi.getOverview.mockResolvedValue(overview());
    renderPage();
    await screen.findByText("Everything is in order.");
    expect(screen.queryByText(/last import|not imported/)).toBeNull();
  });
});

describe("Recent transactions", () => {
  const row = (fields) => ({ category_label: null, is_tab: false, transfer_account_name: null, part_count: 0, ...fields });

  it("lists rows across accounts with their account, and a transfer once", async () => {
    overviewApi.getOverview.mockResolvedValue(
      overview({
        accounts: [
          { id: 1, name: "Revolut", balance_cents: 0, last_import_date: "2026-10-22" },
          { id: 2, name: "Crelan", balance_cents: 0, last_import_date: "2026-10-22" },
        ],
        recent: [
          row({ id: 1, date: "2026-10-23", payee: "SALARY", amount_cents: 240000, account_name: "Crelan", category_label: "Income" }),
          row({ id: 2, date: "2026-10-22", payee: "Pizzeria", amount_cents: -6000, account_name: "Revolut", part_count: 2 }),
          row({ id: 3, date: "2026-10-21", payee: "To savings", amount_cents: -50000, account_name: "Revolut", transfer_account_name: "Crelan" }),
        ],
      }),
    );
    renderPage();
    const recent = await screen.findByRole("region", { name: "Recent transactions" });

    const rows = await within(recent).findAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/SALARY.*Income.*\+€2,400\.00.*Crelan/),
      expect.stringMatching(/Pizzeria.*Split · 2.*Revolut/),
      expect.stringMatching(/Revolut → Crelan.*Transfer.*€500\.00$/),
    ]);
    expect(rows[2].textContent).not.toMatch(/[-+]€500/);
    expect(within(recent).getByRole("link", { name: /View all/ })).toHaveAttribute("href", "/transactions");
  });

  it("leaves out account names with a single account", async () => {
    overviewApi.getOverview.mockResolvedValue(
      overview({ recent: [row({ id: 1, date: "2026-10-23", payee: "SALARY", amount_cents: 240000, account_name: "Joint" })] }),
    );
    renderPage();
    const recent = await screen.findByRole("region", { name: "Recent transactions" });

    const [only] = await within(recent).findAllByRole("listitem");
    expect(only.textContent).not.toMatch(/Joint/);
  });
});

describe("Charts and tabs", () => {
  it("both charts follow the page's month", async () => {
    renderPage();
    expect(await screen.findByText("Groceries 2026-10")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));

    expect(await screen.findByText("Groceries 2026-09")).toBeInTheDocument();
    expect(reportsApi.getCategorySpending).toHaveBeenLastCalledWith("2026-09");
    expect(reportsApi.getCashFlow).toHaveBeenLastCalledWith("2026-09");
    expect(screen.getByText(/12 months to September 2026/)).toBeInTheDocument();
  });

  it("toggles the chart tables from the panel header", async () => {
    renderPage();
    const inOut = await screen.findByRole("region", { name: "In vs out" });

    await userEvent.click(await within(inOut).findByRole("button", { name: "Show as table" }));

    expect(within(inOut).getByRole("columnheader", { name: "Money in" })).toBeInTheDocument();
    expect(within(inOut).getByText(/Excludes transfers and tabs/)).toBeInTheDocument();
  });

  it("shows open tabs, and nothing when there are none", async () => {
    tabsApi.listTabs.mockResolvedValue([
      { id: 11, name: "Jan", group_name: "Tabs", balance_cents: 3000, open_since: "2026-10-03", row_count: 1 },
    ]);
    const { unmount } = renderPage();
    const tabs = await screen.findByRole("region", { name: "Open tabs" });
    expect(within(tabs).getByRole("link", { name: /Jan owes you/ })).toHaveAttribute("href", "/tabs/11");
    unmount();

    tabsApi.listTabs.mockResolvedValue([]);
    renderPage();
    await screen.findByText("Everything is in order.");
    expect(screen.queryByRole("region", { name: "Open tabs" })).toBeNull();
  });

  it("keeps the other panels when one fails", async () => {
    reportsApi.getCategorySpending.mockRejectedValue(new Error("Server exploded"));
    renderPage();

    expect(await screen.findByText("Couldn't load spending per category.")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: /Money in vs money out/ })).toBeInTheDocument();
    expect(await screen.findByText("Everything is in order.")).toBeInTheDocument();
  });

  it("shows a loading placeholder per panel", async () => {
    reportsApi.getCashFlow.mockReturnValue(new Promise(() => {}));
    renderPage();

    await screen.findByText("Groceries 2026-10");
    expect(within(panel("In vs out")).getByTestId("panel-loading")).toBeInTheDocument();
  });
});

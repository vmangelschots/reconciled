import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TabPage } from "./TabPage";
import { ToastProvider } from "../components/ui/Toast";
import * as categoriesApi from "../api/categories";
import * as tabsApi from "../api/tabs";
import * as transactionsApi from "../api/transactions";
import { formatMoney } from "../lib/money";

vi.mock("../api/tabs", () => ({ getTab: vi.fn() }));
vi.mock("../api/categories", () => ({ listCategories: vi.fn() }));
vi.mock("../api/transactions", () => ({ updateTransaction: vi.fn() }));

const CATEGORIES = [
  { id: 1, name: "Restaurants", parent: null, is_tab_group: false, is_tab: false },
  { id: 10, name: "Tabs", parent: null, is_tab_group: true, is_tab: false },
  { id: 11, name: "Jan", parent: 10, is_tab_group: false, is_tab: true },
];

function row(id, date, payee, amount_cents, running_balance_cents, extra = {}) {
  return { id, date, payee, notes: "", amount_cents, running_balance_cents, split_parent: null, parent_amount_cents: null, ...extra };
}

function tab(rows, balance_cents, open_since = null) {
  return { id: 11, name: "Jan", group_name: "Tabs", balance_cents, open_since, row_count: rows.length, rows };
}

function renderPage(id = 11) {
  return render(
    <MemoryRouter initialEntries={[`/tabs/${id}`]}>
      <ToastProvider>
        <Routes>
          <Route path="/tabs/:id" element={<TabPage />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  categoriesApi.listCategories.mockResolvedValue(CATEGORIES);
});

describe("TabPage", () => {
  it("lists rows oldest first with lent/repaid, a running balance and a Settled divider", async () => {
    tabsApi.getTab.mockResolvedValue(
      tab(
        [
          row(5, "2026-10-03", "Pizzeria", -3000, 3000, { split_parent: 4, parent_amount_cents: -6000 }),
          row(6, "2026-10-12", "JAN PEETERS", 3000, 0),
        ],
        0,
      ),
    );
    renderPage();

    expect(await screen.findByText("Pizzeria")).toBeInTheDocument();
    expect(screen.getByText("Tabs / Jan")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(`part of ${formatMoney(6000)}`);
    expect(items[0]).toHaveTextContent(`lent${formatMoney(3000)}`);
    expect(items[0]).toHaveTextContent(`owes ${formatMoney(3000)}`);
    expect(items[1]).toHaveTextContent("JAN PEETERS");
    expect(items[1]).toHaveTextContent(`repaid${formatMoney(3000)}`);
    expect(items[1]).toHaveTextContent("settled");
    expect(screen.getByRole("separator")).toHaveTextContent("Settled");
    // A repaid stretch has nothing left to settle.
    expect(screen.queryByRole("button", { name: /Settle/ })).toBeNull();
  });

  it("collapses older settled stretches", async () => {
    tabsApi.getTab.mockResolvedValue(
      tab(
        [
          row(1, "2026-09-01", "Concert", -4500, 4500),
          row(2, "2026-09-05", "JAN PEETERS", 4500, 0),
          row(3, "2026-10-12", "Pizzeria", -3000, 3000),
        ],
        3000,
        "2026-10-12",
      ),
    );
    renderPage();

    expect(await screen.findByText("Pizzeria")).toBeInTheDocument();
    expect(screen.queryByText("Concert")).toBeNull();
    expect(screen.getByText(`Jan owes you ${formatMoney(3000)}`)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Show earlier \(2 settled rows\)/ }));
    expect(screen.getByText("Concert")).toBeInTheDocument();
    // Only a lent row that is still open can be settled outside the account.
    expect(screen.getAllByRole("button", { name: /Settle/ }).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Settle Pizzeria outside the account",
    ]);
  });

  it("says when the tab doesn't exist", async () => {
    tabsApi.getTab.mockRejectedValue(Object.assign(new Error("Tab not found."), { status: 404 }));
    renderPage(1);

    expect(await screen.findByText("Tab not found.")).toBeInTheDocument();
  });

  it("settles a row outside the account by moving it to a category", async () => {
    tabsApi.getTab
      .mockResolvedValueOnce(tab([row(5, "2026-10-03", "Pizzeria", -3000, 3000)], 3000, "2026-10-03"))
      .mockResolvedValueOnce(tab([], 0));
    transactionsApi.updateTransaction.mockResolvedValue({});
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: /Settle Pizzeria/ }));
    // Neither the tab group nor another tab is offered.
    expect(screen.queryByRole("option", { name: "Jan" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Tabs" })).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: "Restaurants" }));

    expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(5, { category: 1 });
    await waitFor(() => expect(screen.queryByText("Pizzeria")).toBeNull());
    expect(screen.getAllByText("Settled").length).toBeGreaterThan(0);
  });
});

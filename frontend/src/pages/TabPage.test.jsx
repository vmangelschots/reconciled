import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TabPage } from "./TabPage";
import { ToastProvider } from "../components/ui/Toast";
import * as categoriesApi from "../api/categories";
import * as tabsApi from "../api/tabs";
import * as transactionsApi from "../api/transactions";
import { formatMoney } from "../lib/money";

vi.mock("../api/tabs", () => ({
  getTab: vi.fn(),
  addCoveredEntry: vi.fn(),
  updateCoveredEntry: vi.fn(),
  deleteCoveredEntry: vi.fn(),
}));
vi.mock("../api/categories", () => ({ listCategories: vi.fn() }));
vi.mock("../api/transactions", () => ({ updateTransaction: vi.fn() }));

const CATEGORIES = [
  { id: 1, name: "Restaurants", parent: null, is_tab_group: false, is_tab: false },
  { id: 2, name: "Takeout", parent: null, is_tab_group: false, is_tab: false },
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

  describe("covered entries", () => {
    const covered = (id, date, payee, amount_cents, running, label = "Takeout") =>
      row(id, date, payee, amount_cents, running, { kind: "covered", covered_category: { id: 2, label } });

    it("lists a covered row with its category and no settle control", async () => {
      tabsApi.getTab.mockResolvedValue(
        tab(
          [
            row(5, "2026-10-03", "Pizzeria", -1000, 1000, { kind: "lent" }),
            covered(6, "2026-11-11", "Sushi Palace", 1500, -500),
          ],
          -500,
          "2026-10-03",
        ),
      );
      renderPage();

      const edit = await screen.findByRole("button", { name: "Edit Sushi Palace" });
      const item = edit.closest("li");
      expect(item).toHaveTextContent("Takeout");
      expect(item).toHaveTextContent(`covered${formatMoney(1500)}`);
      expect(item).toHaveTextContent(`you owe ${formatMoney(500)}`);
      expect(screen.getByText(`You owe Jan ${formatMoney(500)}`)).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /Settle/ }).map((b) => b.getAttribute("aria-label"))).toEqual([
        "Settle Pizzeria outside the account",
      ]);
    });

    it("opens the form from the header, hides the header action and records an entry", async () => {
      tabsApi.getTab.mockResolvedValue(tab([row(5, "2026-10-03", "Pizzeria", -1000, 1000, { kind: "lent" })], 1000));
      tabsApi.addCoveredEntry.mockResolvedValue({
        ...tab(
          [row(5, "2026-10-03", "Pizzeria", -1000, 1000, { kind: "lent" }), covered(9, "2026-11-11", "Sushi Palace", 1500, -500)],
          -500,
        ),
        saved_row: 9,
      });
      renderPage();

      await userEvent.click(await screen.findByRole("button", { name: "Jan paid for…" }));
      expect(screen.queryByRole("button", { name: "Jan paid for…" })).toBeNull();
      expect(screen.getByLabelText("Amount")).toHaveFocus();

      await userEvent.type(screen.getByLabelText("Amount"), "15");
      expect(screen.getByRole("status")).toHaveTextContent(`You'll owe Jan ${formatMoney(500)}`);
      await userEvent.type(screen.getByLabelText("What it was"), "Sushi Palace");
      await userEvent.click(screen.getByRole("button", { name: "Category" }));
      await userEvent.click(screen.getByRole("option", { name: "Takeout" }));
      await userEvent.click(screen.getByRole("button", { name: "Add to Takeout" }));

      expect(tabsApi.addCoveredEntry).toHaveBeenCalledWith(11, expect.objectContaining({ amount_cents: 1500, category: 2 }));
      const added = await screen.findByRole("button", { name: "Edit Sushi Palace" });
      expect(added.closest("li").className).toMatch(/bg-accent/);
      expect(screen.queryByLabelText("Amount")).toBeNull();
      expect(screen.getByText(`You owe Jan ${formatMoney(500)}`)).toBeInTheDocument();
    });

    it("offers the entry as the last line of an empty tab", async () => {
      tabsApi.getTab.mockResolvedValue(tab([], 0));
      renderPage();

      expect(await screen.findByText("Nothing on this tab yet.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Jan paid for something" }));
      expect(screen.getByLabelText("Amount")).toBeInTheDocument();
    });

    it("shows a backdated entry by expanding the earlier rows", async () => {
      const settled = [
        row(1, "2026-09-01", "Concert", -4500, 4500, { kind: "lent" }),
        row(2, "2026-09-05", "JAN PEETERS", 4500, 0, { kind: "repaid" }),
      ];
      tabsApi.getTab.mockResolvedValue(tab([...settled, row(3, "2026-10-12", "Pizzeria", -3000, 3000, { kind: "lent" })], 3000));
      tabsApi.addCoveredEntry.mockResolvedValue({
        ...tab(
          [
            covered(8, "2026-08-20", "Bakery", 500, -500),
            row(1, "2026-09-01", "Concert", -4500, 4000, { kind: "lent" }),
            row(2, "2026-09-05", "JAN PEETERS", 4500, -500, { kind: "repaid" }),
            row(3, "2026-10-12", "Pizzeria", -3000, 2500, { kind: "lent" }),
          ],
          2500,
        ),
        saved_row: 8,
      });
      renderPage();

      expect(await screen.findByText("Pizzeria")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Jan paid for…" }));
      await userEvent.type(screen.getByLabelText("Amount"), "5");
      await userEvent.type(screen.getByLabelText("What it was"), "Bakery");
      await userEvent.click(screen.getByRole("button", { name: "Category" }));
      await userEvent.click(screen.getByRole("option", { name: "Takeout" }));
      await userEvent.type(screen.getByLabelText("What it was"), "{Enter}");

      expect(await screen.findByRole("button", { name: "Edit Bakery" })).toBeInTheDocument();
      expect(screen.getByText("Concert")).toBeInTheDocument();
    });

    it("edits a covered row in place, one form at a time, and deletes it", async () => {
      tabsApi.getTab.mockResolvedValue(
        tab([row(5, "2026-10-03", "Pizzeria", -1000, 1000, { kind: "lent" }), covered(6, "2026-11-11", "Sushi Palace", 1500, -500)], -500),
      );
      tabsApi.deleteCoveredEntry.mockResolvedValue({
        ...tab([row(5, "2026-10-03", "Pizzeria", -1000, 1000, { kind: "lent" })], 1000),
        saved_row: null,
      });
      renderPage();

      await userEvent.click(await screen.findByRole("button", { name: "Edit Sushi Palace" }));
      expect(screen.getByLabelText("Amount")).toHaveValue("15.00");
      // The balance without the row being edited.
      expect(screen.getByRole("status")).toHaveTextContent(`You'll owe Jan ${formatMoney(500)}`);
      expect(screen.queryByRole("button", { name: "Jan paid for…" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Jan paid for something" })).toBeNull();

      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      expect(tabsApi.deleteCoveredEntry).toHaveBeenCalledWith(11, 6);
      await waitFor(() => expect(screen.queryByText("Sushi Palace")).toBeNull());
      expect(screen.getByText(`Jan owes you ${formatMoney(1000)}`)).toBeInTheDocument();
    });

    it("saves an edit", async () => {
      tabsApi.getTab.mockResolvedValue(tab([covered(6, "2026-11-11", "Sushi Palace", 1500, -1500)], -1500));
      tabsApi.updateCoveredEntry.mockResolvedValue({
        ...tab([covered(6, "2026-11-11", "Sushi Palace", 1200, -1200)], -1200),
        saved_row: 6,
      });
      renderPage();

      await userEvent.click(await screen.findByRole("button", { name: "Edit Sushi Palace" }));
      await userEvent.clear(screen.getByLabelText("Amount"));
      await userEvent.type(screen.getByLabelText("Amount"), "12{Enter}");

      expect(tabsApi.updateCoveredEntry).toHaveBeenCalledWith(
        11,
        6,
        expect.objectContaining({ amount_cents: 1200, category: 2, payee: "Sushi Palace", date: "2026-11-11" }),
      );
      expect(await screen.findByText(`You owe Jan ${formatMoney(1200)}`)).toBeInTheDocument();
    });
  });
});

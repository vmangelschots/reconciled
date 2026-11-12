import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { BudgetsPage } from "../pages/BudgetsPage";
import { ToastProvider } from "./ui/Toast";
import * as transactionsApi from "../api/transactions";
import * as budgetsApi from "../api/budgets";
import * as categoriesApi from "../api/categories";
import * as reportsApi from "../api/reports";
import { formatMoney } from "../lib/money";

vi.mock("../api/reports", () => ({ getSpendingCell: vi.fn() }));
vi.mock("../api/transactions", () => ({ updateTransaction: vi.fn(), getReviewCount: vi.fn() }));

vi.mock("../api/budgets", async () => {
  const actual = await vi.importActual("../api/budgets");
  return { ...actual, getBudgetSummary: vi.fn(), setBudgetStartMonth: vi.fn() };
});

vi.mock("../api/categories", async () => {
  const actual = await vi.importActual("../api/categories");
  return { ...actual, listCategories: vi.fn(), setCategoryLimit: vi.fn(), setCategoryBudget: vi.fn() };
});

const YEARLY_CATEGORIES = [
  {
    id: 1, name: "Groceries", parent: null, budget_kind: "monthly",
    monthly_limits: { default_cents: 10000, override_count: 1 }, yearly: null, yearly_history: [],
  },
  {
    id: 2, name: "Transport", parent: null, budget_kind: "monthly",
    monthly_limits: { default_cents: null, override_count: 0 }, yearly: null, yearly_history: [],
  },
  {
    id: 3, name: "Clothing", parent: null, budget_kind: "yearly",
    monthly_limits: { default_cents: null, override_count: 0 },
    yearly: { amount_cents: 120000, due: null },
    yearly_history: [{ from_year: 2026, amount_cents: 120000, due: null }],
  },
  {
    id: 4, name: "Property tax", parent: null, budget_kind: "target",
    monthly_limits: { default_cents: null, override_count: 0 },
    yearly: { amount_cents: 40000, due: "11-01" },
    yearly_history: [{ from_year: 2026, amount_cents: 40000, due: "11-01" }],
  },
];

const CLOTHING_ROW = {
  category_id: 3, category_name: "Clothing", parent_id: null, kind: "yearly",
  amount_cents: 120000, budget_cents: 30000, prorated_from: "2026-10-01", spent_cents: 18000,
  remaining_cents: 12000, over: false, ahead: false, pace: 0.26, runway_cents: 4000,
  due_date: null, state: null, difference_cents: null,
};

const TAX_ROW = {
  category_id: 4, category_name: "Property tax", parent_id: null, kind: "target",
  amount_cents: 40000, budget_cents: 40000, prorated_from: null, spent_cents: 0,
  remaining_cents: 40000, over: false, ahead: false, pace: null, runway_cents: null,
  due_date: "2026-11-01", state: "due_soon", difference_cents: -40000,
};

const GROCERIES_ROW = {
  category_id: 1, category_name: "Groceries", parent_id: null, limit_cents: 10000, spent_cents: 5000,
  remaining_cents: 5000, over_limit: false, covers_subcategories: false, covered_by_parent: false,
  caps_cents: null, group_spent_cents: null, overridden: false,
};
const TRANSPORT_ROW = {
  ...GROCERIES_ROW, category_id: 2, category_name: "Transport", limit_cents: null, spent_cents: 0, remaining_cents: null,
};

function summary(yearly = {}, extra = {}) {
  return {
    categories: [GROCERIES_ROW, TRANSPORT_ROW],
    uncategorized_spent_cents: 0,
    yearly_spent_cents: 0,
    yearly: {
      year: 2026, through: "2026-10-24", start_month: "2026-10-01", starts: null,
      categories: [CLOTHING_ROW, TAX_ROW],
      ...yearly,
    },
    totals: {
      has_limits: true, limit_cents: 10000, spent_cents: 5000, outside_cents: 3500,
      yearly_spent_cents: 13000, uncategorized_cents: 4200,
    },
    pace: 0.77,
    days_left: 8,
    attention: { categories: [], yearly: [] },
    ...extra,
  };
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.search}</p>;
}

function renderPage(path = "/budgets") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route
            path="/budgets"
            element={
              <>
                <BudgetsPage />
                <Where />
              </>
            }
          />
          <Route path="/categories" element={<p>Category settings</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const CELL = {
  name: "Groceries", month: "2026-10", total_cents: -5000, accounts: ["Crelan"], uncategorized: false,
  rows: [
    {
      id: 5, date: "2026-10-12", payee: "Delhaize", amount_cents: -5000, account_id: 3, account_name: "Crelan",
      category: 1, category_label: "Groceries", split_amount_cents: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 24));
  categoriesApi.listCategories.mockResolvedValue(YEARLY_CATEGORIES);
  budgetsApi.getBudgetSummary.mockResolvedValue(summary());
  budgetsApi.setBudgetStartMonth.mockResolvedValue({});
  categoriesApi.setCategoryBudget.mockResolvedValue({});
  categoriesApi.setCategoryLimit.mockResolvedValue({});
  reportsApi.getSpendingCell.mockResolvedValue(CELL);
});
afterEach(() => vi.useRealTimers());

async function openRow(name) {
  // Transport has no budget, so it starts collapsed.
  if (name === "Transport") await userEvent.click(await screen.findByRole("button", { name: /No budget/ }));
  await userEvent.click(await screen.findByRole("button", { name: `Open budget for ${name}` }));
}

async function openEditor(name) {
  await openRow(name);
  return screen.findByRole("form", { name: `Budget for ${name}` });
}

async function setAmount(form, value) {
  const input = within(form).getByLabelText("Amount");
  await userEvent.clear(input);
  await userEvent.type(input, value);
}

describe("BudgetSheet", () => {
  it("lists a covered entry as Paid by its tab, without a picker", async () => {
    reportsApi.getSpendingCell.mockResolvedValue({
      ...CELL,
      accounts: ["Paid by Sarah"],
      rows: [{ ...CELL.rows[0], payee: "Sushi Palace", account_id: 99, account_name: "Paid by Sarah", paid_by_tab: 11 }],
    });
    renderPage();
    await openEditor("Groceries");
    const sheet = screen.getByRole("dialog");

    expect(await within(sheet).findByRole("link", { name: "Sushi Palace" })).toHaveAttribute("href", "/tabs/11");
    expect(within(sheet).queryByRole("button", { name: /Category for Sushi Palace/ })).toBeNull();
  });

  it("shows the budget's figures and the viewed month's transactions", async () => {
    renderPage();
    await openEditor("Groceries");
    const sheet = screen.getByRole("dialog");

    expect(within(sheet).getByRole("heading", { name: "Groceries" })).toBeInTheDocument();
    expect(await within(sheet).findByText("Delhaize")).toBeInTheDocument();
    expect(within(sheet).getByText("Transactions in October 2026")).toBeInTheDocument();
    expect(reportsApi.getSpendingCell).toHaveBeenCalledWith("2026-10", 1, { category: 1, month: "2026-10" });
    expect(within(sheet).getByRole("link", { name: /Rename or move in Categories/ })).toHaveAttribute("href", "/categories");
  });

  it("closes on save, refreshes the figures and highlights the row", async () => {
    renderPage();
    const form = await openEditor("Groceries");
    await setAmount(form, "450");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Budget updated.")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Budget for Groceries" })).toBeNull();
    expect(budgetsApi.getBudgetSummary).toHaveBeenCalledTimes(2);
    expect((await screen.findByRole("button", { name: "Open budget for Groceries" })).closest("li").className).toContain("bg-accent/5");
  });

  it("refreshes the figures after fixing a transaction's category", async () => {
    transactionsApi.updateTransaction.mockResolvedValue({});
    renderPage();
    await openEditor("Groceries");
    const sheet = screen.getByRole("dialog");
    await userEvent.click(await within(sheet).findByRole("button", { name: /Category for Delhaize/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Transport" }));

    expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(5, { category: 2 });
    expect(budgetsApi.getBudgetSummary).toHaveBeenCalledTimes(2);
  });

  it("says when the month has no transactions", async () => {
    reportsApi.getSpendingCell.mockResolvedValue({ ...CELL, rows: [] });
    renderPage();
    await openEditor("Clothing");
    expect(await screen.findByText("No transactions this month.")).toBeInTheDocument();
  });

  it("closes with Escape", async () => {
    renderPage();
    await openEditor("Groceries");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sets a monthly limit from the sheet", async () => {
    renderPage();
    const form = await openEditor("Groceries");
    await setAmount(form, "450");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(categoriesApi.setCategoryLimit).toHaveBeenCalledWith(1, { month: null, limit_cents: 45000 });
  });

  it("asks before switching a monthly category to yearly, and saves nothing on cancel", async () => {
    renderPage();
    const form = await openEditor("Groceries");
    await userEvent.click(within(form).getByRole("button", { name: "Yearly" }));
    await setAmount(form, "1200");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      `Switching Groceries to yearly removes the ${formatMoney(10000)} monthly limit and 1 month override.`,
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(categoriesApi.setCategoryBudget).not.toHaveBeenCalled();

    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    await userEvent.click(await screen.findByRole("button", { name: "Switch to yearly" }));
    expect(categoriesApi.setCategoryBudget).toHaveBeenCalledWith(1, { kind: "yearly", amount_cents: 120000, due: undefined });
  });

  it("asks before switching a yearly category to monthly", async () => {
    categoriesApi.listCategories.mockResolvedValue(
      YEARLY_CATEGORIES.map((c) =>
        c.id === 3
          ? { ...c, yearly_history: [{ from_year: 2027, amount_cents: 150000, due: null }, ...c.yearly_history] }
          : c,
      ),
    );
    renderPage();
    const form = await openEditor("Clothing");
    await userEvent.click(within(form).getByRole("button", { name: "Monthly" }));
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Switching Clothing to monthly removes its yearly amount and history.",
    );
  });

  it("doesn't carry a monthly amount over as a yearly one", async () => {
    renderPage();
    const form = await openEditor("Groceries");
    expect(within(form).getByLabelText("Amount")).toHaveValue(100);
    await userEvent.click(within(form).getByRole("button", { name: "Yearly" }));
    expect(within(form).getByLabelText("Amount")).toHaveValue(null);
    await userEvent.click(within(form).getByRole("button", { name: "Monthly" }));
    expect(within(form).getByLabelText("Amount")).toHaveValue(100);
  });

  it("switches without asking when there is nothing to drop", async () => {
    renderPage();
    const form = await openEditor("Transport");
    await userEvent.click(within(form).getByRole("button", { name: "Yearly" }));
    await setAmount(form, "500");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(categoriesApi.setCategoryBudget).toHaveBeenCalledWith(2, { kind: "yearly", amount_cents: 50000, due: undefined });
  });

  it("switches yearly to on a date without asking, with a due date", async () => {
    renderPage();
    const form = await openEditor("Clothing");
    await userEvent.click(within(form).getByRole("button", { name: "On a date" }));
    await userEvent.type(within(form).getByLabelText("Due day"), "1");
    await userEvent.click(within(form).getByRole("combobox", { name: "Due month" }));
    await userEvent.click(await screen.findByRole("option", { name: "Nov" }));
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(categoriesApi.setCategoryBudget).toHaveBeenCalledWith(3, { kind: "target", amount_cents: 120000, due: "11-01" });
  });

  it("edits a yearly budget and says which years it applies to", async () => {
    renderPage();
    const form = await openEditor("Clothing");
    expect(within(form).getByText(/Applies to 2026 and later\./)).toBeInTheDocument();
    await setAmount(form, "1500");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(categoriesApi.setCategoryBudget).toHaveBeenCalledWith(3, { kind: "yearly", amount_cents: 150000, due: undefined });
  });

  it("states the scope when editing while viewing an earlier year", async () => {
    vi.setSystemTime(new Date(2027, 0, 5));
    budgetsApi.getBudgetSummary.mockResolvedValue(summary({ through: "2026-12-31" }));
    renderPage("/budgets?month=2026-12");
    const form = await openEditor("Clothing");

    expect(within(form).getByText(`Applies to 2027 and later. 2026 stays ${formatMoney(120000)}.`)).toHaveClass(
      "text-warning",
    );
  });

});

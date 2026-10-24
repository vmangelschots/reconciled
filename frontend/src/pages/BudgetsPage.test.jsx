import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { BudgetsPage } from "./BudgetsPage";
import { ToastProvider } from "../components/ui/Toast";
import * as budgetsApi from "../api/budgets";
import * as categoriesApi from "../api/categories";
import * as tabsApi from "../api/tabs";
import { formatMoney } from "../lib/money";

vi.mock("../api/tabs", () => ({ listTabs: vi.fn() }));

vi.mock("../api/budgets", async () => {
  const actual = await vi.importActual("../api/budgets");
  return { ...actual, getBudgetSummary: vi.fn() };
});

vi.mock("../api/categories", async () => {
  const actual = await vi.importActual("../api/categories");
  return {
    ...actual,
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    setCategoryLimit: vi.fn(),
  };
});

const CATEGORIES = [
  { id: 1, name: "Groceries", parent: null },
  { id: 2, name: "Transport", parent: null },
];

const SUMMARY = {
  categories: [
    { category_id: 1, category_name: "Groceries", parent_id: null, limit_cents: 10000, spent_cents: 5000, remaining_cents: 5000, over_limit: false },
    { category_id: 2, category_name: "Transport", parent_id: null, limit_cents: null, spent_cents: 0, remaining_cents: null, over_limit: false },
  ],
  uncategorized_spent_cents: 0,
};

function renderPage() {
  return render(
    <ToastProvider>
      <BudgetsPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  categoriesApi.listCategories.mockResolvedValue(CATEGORIES);
  budgetsApi.getBudgetSummary.mockResolvedValue(SUMMARY);
  tabsApi.listTabs.mockResolvedValue([]);
});

describe("BudgetsPage", () => {
  it("disables a category's Rename/Delete buttons immediately on Delete", async () => {
    let resolveDelete;
    categoriesApi.deleteCategory.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );

    renderPage();
    await waitFor(() => expect(screen.getAllByText("Groceries").length).toBeGreaterThan(0));

    const [deleteGroceries] = screen.getAllByRole("button", { name: "Delete" });
    const [renameGroceries] = screen.getAllByRole("button", { name: "Rename" });
    await userEvent.click(deleteGroceries);

    expect(deleteGroceries).toBeDisabled();
    expect(renameGroceries).toBeDisabled();

    categoriesApi.listCategories.mockResolvedValue([CATEGORIES[1]]);
    budgetsApi.getBudgetSummary.mockResolvedValue({ ...SUMMARY, categories: [SUMMARY.categories[1]] });
    resolveDelete({});

    await waitFor(() => expect(screen.queryAllByText("Groceries")).toHaveLength(0));
  });
});

describe("BudgetsPage tab groups", () => {
  const WITH_TABS = [
    ...CATEGORIES,
    { id: 10, name: "Tabs", parent: null, is_tab_group: true, is_tab: false, transaction_count: 0 },
    { id: 11, name: "Jan", parent: 10, is_tab_group: false, is_tab: true, transaction_count: 2 },
  ];

  it("creates a tab group with the kind switch", async () => {
    categoriesApi.createCategory.mockResolvedValue({});
    renderPage();
    await screen.findAllByText("Groceries");

    await userEvent.type(screen.getAllByLabelText("Name")[0], "Owed");
    await userEvent.click(screen.getByRole("button", { name: "Tab" }));
    await userEvent.click(screen.getByRole("button", { name: "Add category" }));

    expect(categoriesApi.createCategory).toHaveBeenCalledWith("Owed", null, true);
  });

  it("asks before switching a group whose tabs have transactions", async () => {
    categoriesApi.listCategories.mockResolvedValue(WITH_TABS);
    categoriesApi.updateCategory.mockResolvedValue({});
    renderPage();
    const tabsRow = (await screen.findByText("Tabs")).closest("li");

    await userEvent.click(within(tabsRow).getAllByRole("button", { name: "Rename" })[0]);
    const form = screen.getByRole("button", { name: "Save" }).closest("form");
    await userEvent.click(within(form).getByRole("button", { name: "Budget" }));
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(categoriesApi.updateCategory).not.toHaveBeenCalled();
    expect(within(form).getByText(/2 transactions in its subcategories will count again/)).toBeInTheDocument();

    await userEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(categoriesApi.updateCategory).not.toHaveBeenCalled();

    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    await userEvent.click(within(form).getByRole("button", { name: "Make it a budget group" }));
    expect(categoriesApi.updateCategory).toHaveBeenCalledWith(10, { name: "Tabs", parent: null, is_tab_group: false });
  });

  it("marks tabs and shows their balance in words", async () => {
    categoriesApi.listCategories.mockResolvedValue(WITH_TABS);
    tabsApi.listTabs.mockResolvedValue([
      { id: 11, name: "Jan", group_name: "Tabs", balance_cents: 3000, open_since: "2026-10-03", row_count: 2 },
    ]);
    renderPage();

    expect(await screen.findByText(`Jan owes you ${formatMoney(3000)}`)).toBeInTheDocument();
    expect(screen.getByText("Tab group · not budgeted")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Tab").length).toBe(2);
  });

  it("shows the inherited kind for a subcategory", async () => {
    categoriesApi.listCategories.mockResolvedValue(WITH_TABS);
    renderPage();
    const janRow = (await screen.findByText("Jan")).closest("div");

    await userEvent.click(within(janRow).getByRole("button", { name: "Rename" }));

    expect(screen.getByText("Tab, from Tabs")).toBeInTheDocument();
  });
});

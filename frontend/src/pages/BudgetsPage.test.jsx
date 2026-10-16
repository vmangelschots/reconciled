import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { BudgetsPage } from "./BudgetsPage";
import { ToastProvider } from "../components/ui/Toast";
import * as budgetsApi from "../api/budgets";
import * as categoriesApi from "../api/categories";

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

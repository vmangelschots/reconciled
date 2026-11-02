import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { CategoriesPage } from "./CategoriesPage";
import { ToastProvider } from "../components/ui/Toast";
import * as categoriesApi from "../api/categories";
import * as tabsApi from "../api/tabs";
import { formatMoney } from "../lib/money";
import { formatDue } from "../lib/yearlyBudgets";

vi.mock("../api/tabs", () => ({ listTabs: vi.fn() }));

vi.mock("../api/categories", async () => {
  const actual = await vi.importActual("../api/categories");
  return {
    ...actual,
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  };
});

const CATEGORIES = [
  { id: 1, name: "Groceries", parent: null },
  { id: 2, name: "Transport", parent: null },
];

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

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <CategoriesPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  categoriesApi.listCategories.mockResolvedValue(CATEGORIES);
  tabsApi.listTabs.mockResolvedValue([]);
});

describe("CategoriesPage", () => {
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
    resolveDelete({});

    await waitFor(() => expect(screen.queryAllByText("Groceries")).toHaveLength(0));
  });
});

describe("CategoriesPage tab groups", () => {
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

describe("CategoriesPage yearly history", () => {
  beforeEach(() => {
    categoriesApi.listCategories.mockResolvedValue(YEARLY_CATEGORIES);
  });

  it("shows a yearly category's history only once there are two lines", async () => {
    categoriesApi.listCategories.mockResolvedValue(
      YEARLY_CATEGORIES.map((c) =>
        c.id === 3
          ? { ...c, yearly: { amount_cents: 150000, due: null }, yearly_history: [{ from_year: 2027, amount_cents: 150000, due: null }, ...c.yearly_history] }
          : c,
      ),
    );
    renderPage();
    expect(await screen.findByText(`Yearly · ${formatMoney(150000)} a year`)).toBeInTheDocument();
    expect(screen.getByText(`On a date · ${formatMoney(40000)} on ${formatDue("11-01")}`)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "History" })).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: "History" }));
    const history = screen.getByRole("list", { name: "Clothing history" });
    expect(history).toHaveTextContent(`2027 onward${formatMoney(150000)}`);
    expect(history).toHaveTextContent(`2026${formatMoney(120000)}`);
  });
});

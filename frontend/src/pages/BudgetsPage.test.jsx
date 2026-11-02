import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { BudgetsPage } from "./BudgetsPage";
import { ToastProvider } from "../components/ui/Toast";
import * as budgetsApi from "../api/budgets";
import * as categoriesApi from "../api/categories";
import * as reportsApi from "../api/reports";
import { formatMoneyWhole as whole } from "../lib/money";
import { formatDayMonth } from "../lib/yearlyBudgets";

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

describe("BudgetsPage headline", () => {
  it("shows the Overview's figures with a verdict", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(
      summary({}, { attention: { categories: [{ id: 1, name: "Groceries", over: true, spent_cents: 5000, limit_cents: 100, share: 5000 }], yearly: [] } }),
    );
    renderPage();

    expect(await screen.findByText("1 needs a look")).toBeInTheDocument();
    expect(screen.getByText(`${whole(5000)} left · ${whole(600)} a day`)).toBeInTheDocument();
    expect(
      screen.getByText(`${whole(13000)} on yearly budgets · +${whole(3500)} outside budgets · ${whole(4200)} uncategorized`),
    ).toBeInTheDocument();
  });

  it("says when the month is on track, and leaves Needs a look out", async () => {
    renderPage();
    expect(await screen.findByText("On track")).toBeInTheDocument();
    expect(screen.queryByText("Needs a look")).toBeNull();
  });

  it("has no per-day figure or marker in a past month", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(summary({ through: "2026-09-30" }, { pace: null, days_left: null }));
    renderPage("/budgets?month=2026-09");

    expect(await screen.findByText(`Finished ${whole(5000)} under`)).toBeInTheDocument();
    expect(screen.queryByText(/a day/)).toBeNull();
  });

  it("asks to set a budget when there are no limits", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(
      summary({}, { totals: { has_limits: false, limit_cents: 0, spent_cents: 0, outside_cents: 5000, yearly_spent_cents: 0, uncategorized_cents: 0 } }),
    );
    renderPage();

    expect(await screen.findByText("Click a category to set a budget.")).toBeInTheDocument();
    expect(screen.getByText(whole(5000))).toBeInTheDocument();
  });
});

describe("BudgetsPage Needs a look", () => {
  it("lists warnings in the Overview's words and opens the budget", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(
      summary({}, {
        attention: {
          categories: [{ id: 1, name: "Groceries", parent_name: null, over: true, spent_cents: 12000, limit_cents: 10000, share: 120 }],
          yearly: [{ id: 4, name: "Property tax", parent_name: null, kind: "target", state: "due_soon", share: 0, spent_cents: 0, budget_cents: 40000, due_date: "2026-11-01" }],
        },
      }),
    );
    renderPage();

    expect(await screen.findByText(`Groceries ${whole(2000)} over`)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Property tax due in 8 days/ }));
    expect(await screen.findByRole("form", { name: "Budget for Property tax" })).toBeInTheDocument();
  });
});

describe("BudgetsPage list", () => {
  it("shows every kind in one list, with no table or category form", async () => {
    renderPage();
    const groceries = await screen.findByRole("button", { name: "Open budget for Groceries" });

    expect(groceries).toHaveTextContent(`${whole(5000)} left`);
    expect(screen.getByRole("button", { name: "Open budget for Clothing" })).toHaveTextContent("€40 a month to Dec");
    expect(screen.getByRole("button", { name: "Open budget for Property tax" })).toHaveTextContent(`${whole(40000)} to pay`);
    expect(within(screen.getByRole("button", { name: "Open budget for Clothing" })).getByTestId("progress-marker")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add category" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
  });

  it("collapses categories without a budget and expands them", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /No budget \(1\)/ }));
    expect(screen.getByRole("button", { name: "Open budget for Transport" })).toBeInTheDocument();
  });

  it("links uncategorized spending to Review", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: "Review →" })).toHaveAttribute("href", "/review");
    expect(screen.getByText(`${whole(4200)} spent`)).toBeInTheDocument();
  });

  it("links to the category settings", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("link", { name: "Categories" }));
    expect(screen.getByText("Category settings")).toBeInTheDocument();
  });

  it("offers the category settings when there are no categories", async () => {
    categoriesApi.listCategories.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("No categories yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a category" })).toHaveAttribute("href", "/categories");
  });
});

describe("BudgetsPage start month", () => {
  it("says how far yearly figures count", async () => {
    renderPage();
    expect(
      await screen.findByText(`Yearly budgets count from October 2026, to ${formatDayMonth("2026-10-24")}`),
    ).toBeInTheDocument();
  });

  it("offers to go to the start month when viewing a month before it", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(summary({ starts: "2026-10-01", categories: [] }));
    renderPage("/budgets?month=2026-09");

    expect(await screen.findByText("Budgeting by year starts in October 2026.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open budget for Groceries" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to October 2026" }));
    expect(screen.getByTestId("where")).toHaveTextContent("?month=2026-10");
  });

  it("sets and clears the start month", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(summary({ start_month: null }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Set start month" }));
    budgetsApi.getBudgetSummary.mockResolvedValue(summary());
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(budgetsApi.setBudgetStartMonth).toHaveBeenCalledWith("2026-10");

    await userEvent.click(await screen.findByRole("button", { name: "Change" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(budgetsApi.setBudgetStartMonth).toHaveBeenLastCalledWith(null);
  });
});

describe("BudgetsPage month", () => {
  it("opens on the month in the address", async () => {
    renderPage("/budgets?month=2026-09");

    await waitFor(() => expect(budgetsApi.getBudgetSummary).toHaveBeenCalledWith("2026-09"));
    expect(screen.getByText(new Date(2026, 8, 1).toLocaleString(undefined, { month: "long", year: "numeric" }))).toBeInTheDocument();
  });

  it("writes the month back to the address when switching", async () => {
    renderPage();
    await waitFor(() => expect(budgetsApi.getBudgetSummary).toHaveBeenCalledWith("2026-10"));

    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));

    await waitFor(() => expect(budgetsApi.getBudgetSummary).toHaveBeenLastCalledWith("2026-09"));
    expect(screen.getByTestId("where")).toHaveTextContent("?month=2026-09");
  });

  it("takes the current month from local time", async () => {
    vi.setSystemTime(new Date(2026, 10, 1, 0, 30)); // 1 Nov 00:30 local
    renderPage();

    await waitFor(() => expect(budgetsApi.getBudgetSummary).toHaveBeenCalledWith("2026-11"));
  });
});


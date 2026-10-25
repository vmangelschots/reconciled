import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { BudgetsPage } from "./BudgetsPage";
import { ToastProvider } from "../components/ui/Toast";
import * as budgetsApi from "../api/budgets";
import * as categoriesApi from "../api/categories";
import * as tabsApi from "../api/tabs";
import { formatMoney } from "../lib/money";
import { formatDayMonth, formatDue } from "../lib/yearlyBudgets";

vi.mock("../api/tabs", () => ({ listTabs: vi.fn() }));

vi.mock("../api/budgets", async () => {
  const actual = await vi.importActual("../api/budgets");
  return { ...actual, getBudgetSummary: vi.fn(), setBudgetStartMonth: vi.fn() };
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
    setCategoryBudget: vi.fn(),
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
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
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

describe("BudgetsPage month", () => {
  afterEach(() => vi.useRealTimers());

  it("opens on the month in the address", async () => {
    renderPage("/budgets?month=2026-09");

    await waitFor(() => expect(budgetsApi.getBudgetSummary).toHaveBeenCalledWith("2026-09"));
    expect(screen.getByText(new Date(2026, 8, 1).toLocaleString(undefined, { month: "long", year: "numeric" }))).toBeInTheDocument();
  });

  it("writes the month back to the address when switching", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 24));
    renderPage();
    await waitFor(() => expect(budgetsApi.getBudgetSummary).toHaveBeenCalledWith("2026-10"));

    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));

    await waitFor(() => expect(budgetsApi.getBudgetSummary).toHaveBeenLastCalledWith("2026-09"));
    expect(screen.getByTestId("where")).toHaveTextContent("?month=2026-09");
  });

  it("takes the current month from local time", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 1, 0, 30)); // 1 Nov 00:30 local
    renderPage();

    await waitFor(() => expect(budgetsApi.getBudgetSummary).toHaveBeenCalledWith("2026-11"));
  });
});

// jsdom has no matchMedia, so pages render their phone layout unless a
// test asks for a wide screen.
function wideScreen() {
  window.matchMedia = (query) => ({
    matches: query.includes("min-width"),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

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

function yearlySummary(yearly = {}, extra = {}) {
  return {
    ...SUMMARY,
    yearly_spent_cents: 0,
    yearly: {
      year: 2026, through: "2026-10-24", start_month: "2026-10-01", starts: null,
      categories: [CLOTHING_ROW, TAX_ROW],
      ...yearly,
    },
    ...extra,
  };
}

describe("BudgetsPage budget editor", () => {
  beforeEach(() => {
    wideScreen();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 24));
    categoriesApi.listCategories.mockResolvedValue(YEARLY_CATEGORIES);
    budgetsApi.getBudgetSummary.mockResolvedValue(yearlySummary());
    categoriesApi.setCategoryBudget.mockResolvedValue({});
    categoriesApi.setCategoryLimit.mockResolvedValue({});
  });
  afterEach(() => {
    vi.useRealTimers();
    delete window.matchMedia;
  });

  async function openEditor(name) {
    await userEvent.click(await screen.findByRole("button", { name: `Edit budget for ${name}` }));
    return screen.getByRole("form", { name: `Budget for ${name}` });
  }

  async function setAmount(form, value) {
    const input = within(form).getByLabelText("Amount");
    await userEvent.clear(input);
    await userEvent.type(input, value);
  }

  it("sets a monthly limit from the monthly table", async () => {
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

  it("edits a yearly budget from This year and says which years it applies to", async () => {
    renderPage();
    const form = await openEditor("Clothing");
    expect(within(form).getByText(/Applies to 2026 and later\./)).toBeInTheDocument();
    await setAmount(form, "1500");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(categoriesApi.setCategoryBudget).toHaveBeenCalledWith(3, { kind: "yearly", amount_cents: 150000, due: undefined });
  });

  it("states the scope when editing while viewing an earlier year", async () => {
    vi.setSystemTime(new Date(2027, 0, 5));
    budgetsApi.getBudgetSummary.mockResolvedValue(yearlySummary({ through: "2026-12-31" }));
    renderPage("/budgets?month=2026-12");
    const form = await openEditor("Clothing");

    expect(within(form).getByText(`Applies to 2027 and later. 2026 stays ${formatMoney(120000)}.`)).toHaveClass(
      "text-warning",
    );
  });

  it("ends the monthly summary with the month's yearly spending", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(yearlySummary({}, { yearly_spent_cents: 58000 }));
    renderPage();
    const row = (await screen.findByText("Yearly budgets")).closest("tr");

    expect(row).toHaveTextContent(formatMoney(58000));
    expect(row).toHaveTextContent("this month · see This year");
  });
});

describe("BudgetsPage this year", () => {
  beforeEach(() => {
    wideScreen();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 24));
    categoriesApi.listCategories.mockResolvedValue(YEARLY_CATEGORIES);
    budgetsApi.getBudgetSummary.mockResolvedValue(yearlySummary());
    budgetsApi.setBudgetStartMonth.mockResolvedValue({});
  });
  afterEach(() => {
    vi.useRealTimers();
    delete window.matchMedia;
  });

  async function yearlyRow(name) {
    const panel = (await screen.findByText("This year (2026)", { exact: false })).closest("section");
    return within(panel).getByText(name).closest("tr");
  }

  it("shows the year's figures as of the viewed day, with the pro-rating", async () => {
    renderPage();
    const row = await yearlyRow("Clothing");

    expect(screen.getByText(`· to ${formatDayMonth("2026-10-24")}`)).toBeInTheDocument();
    expect(row).toHaveTextContent(formatMoney(30000));
    expect(row).toHaveTextContent(`of ${formatMoney(120000)} · from Oct`);
    expect(row).toHaveTextContent(formatMoney(18000));
    expect(row).toHaveTextContent(formatMoney(12000));
    expect(row).toHaveTextContent("€40 a month to Dec");
    expect(within(row).getByTestId("progress-marker")).toBeInTheDocument();
  });

  it("says how much a yearly budget is over", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(
      yearlySummary({ categories: [{ ...CLOTHING_ROW, spent_cents: 33000, remaining_cents: -3000, over: true, runway_cents: null }] }),
    );
    renderPage();
    expect(await yearlyRow("Clothing")).toHaveTextContent("€30 over for 2026");
  });

  it("shows no runway or pace for a past month", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(
      yearlySummary({ through: "2026-09-30", categories: [{ ...CLOTHING_ROW, pace: null, runway_cents: null }] }),
    );
    renderPage();
    const row = await yearlyRow("Clothing");
    expect(row).not.toHaveTextContent("a month to Dec");
    expect(within(row).queryByTestId("progress-marker")).toBeNull();
  });

  it("turns the bar amber when running ahead", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(
      yearlySummary({ categories: [{ ...CLOTHING_ROW, spent_cents: 27000, remaining_cents: 3000, ahead: true, runway_cents: 1000 }] }),
    );
    renderPage();
    expect(within(await yearlyRow("Clothing")).getByTestId("progress-fill")).toHaveClass("bg-warning");
  });

  it.each([
    [{ state: "due_soon" }, `Due ${formatDayMonth("2026-11-01")}, in 8 days`],
    [{ state: "not_seen" }, `Due ${formatDayMonth("2026-11-01")}, not seen yet`],
    [{ state: "overdue" }, `Overdue since ${formatDayMonth("2026-11-01")}`],
    [{ state: "partly_paid", spent_cents: 30000 }, "Partly paid · €100 short"],
    [{ state: "paid_over", spent_cents: 45000 }, "Paid · €50 over"],
    [{ state: "paid", spent_cents: 39812 }, `Paid · ${formatMoney(188)} under`],
  ])("labels a target %o", async (fields, label) => {
    budgetsApi.getBudgetSummary.mockResolvedValue(yearlySummary({ categories: [{ ...TAX_ROW, ...fields }] }));
    renderPage();
    expect(await yearlyRow("Property tax")).toHaveTextContent(label);
  });

  it("offers to go to the start month when viewing a month before it", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(yearlySummary({ starts: "2026-10-01", categories: [] }));
    renderPage("/budgets?month=2026-09");

    expect(await screen.findByText("Budgeting by year starts in October 2026.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to October 2026" }));
    expect(screen.getByTestId("where")).toHaveTextContent("?month=2026-10");
  });

  it("sets and clears the start month", async () => {
    budgetsApi.getBudgetSummary.mockResolvedValue(yearlySummary({ start_month: null }));
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Set start month" }));
    const strip = screen.getByText("Yearly budgets count from").closest("div");
    budgetsApi.getBudgetSummary.mockResolvedValue(yearlySummary());
    await userEvent.click(within(strip).getByRole("button", { name: "Save" }));
    expect(budgetsApi.setBudgetStartMonth).toHaveBeenCalledWith("2026-10");

    await waitFor(() => expect(screen.getByRole("button", { name: /From Oct 2026/ })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /From Oct 2026/ }));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(budgetsApi.setBudgetStartMonth).toHaveBeenLastCalledWith(null);
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

describe("BudgetsPage on a phone", () => {
  beforeEach(() => {
    categoriesApi.listCategories.mockResolvedValue(YEARLY_CATEGORIES);
    budgetsApi.getBudgetSummary.mockResolvedValue(yearlySummary());
  });

  it("stacks the rows and opens the editor under the tapped one", async () => {
    renderPage("/budgets?month=2026-10");
    expect(await screen.findByText(`${formatMoney(12000)} left`)).toBeInTheDocument();
    expect(screen.getByText(`${formatMoney(18000)} of ${formatMoney(30000)} · of ${formatMoney(120000)} · from Oct`)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Edit budget for Clothing" }));
    const form = screen.getByRole("form", { name: "Budget for Clothing" });
    expect(form.closest("li")).toHaveTextContent("Clothing");
  });
});

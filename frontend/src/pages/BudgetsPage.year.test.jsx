import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { BudgetsPage } from "./BudgetsPage";
import { ToastProvider } from "../components/ui/Toast";
import * as budgetsApi from "../api/budgets";
import * as categoriesApi from "../api/categories";
import * as plansApi from "../api/plans";
import { formatMoneyWhole as whole } from "../lib/money";

vi.mock("../api/reports", () => ({ getSpendingCell: vi.fn() }));
vi.mock("../api/transactions", () => ({ updateTransaction: vi.fn(), getReviewCount: vi.fn() }));
vi.mock("../api/budgets", () => ({ getBudgetSummary: vi.fn(), setBudgetStartMonth: vi.fn() }));
vi.mock("../api/categories", async () => {
  const actual = await vi.importActual("../api/categories");
  return { ...actual, listCategories: vi.fn() };
});
vi.mock("../api/plans", () => ({
  listPlans: vi.fn(),
  getCurrentPlan: vi.fn(),
  getPlan: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  deletePlan: vi.fn(),
  duplicatePlan: vi.fn(),
  setPlanBudget: vi.fn(),
  removePlanBudget: vi.fn(),
  setPlanBills: vi.fn(),
  takeCurrentIntoPlan: vi.fn(),
  addPlanCategory: vi.fn(),
  addIncomeLine: vi.fn(),
  updateIncomeLine: vi.fn(),
  deleteIncomeLine: vi.fn(),
  getIncomeSuggestions: vi.fn(),
  previewApply: vi.fn(),
  applyPlan: vi.fn(),
}));

const CATEGORIES = [
  { id: 1, name: "Groceries", parent: null, budget_kind: "monthly", monthly_limits: { default_cents: 65000, defaults: [], override_count: 0 } },
  { id: 2, name: "Holidays", parent: null, budget_kind: "monthly", monthly_limits: { default_cents: 25000, defaults: [], override_count: 0 } },
  { id: 3, name: "Income", parent: null, budget_kind: "monthly", monthly_limits: { default_cents: null, defaults: [], override_count: 0 } },
];

const months = (cents) => Array(12).fill(cents);

function row(extra) {
  return {
    category_id: 1, category_name: "Groceries", parent_id: null, kind: "monthly", locked: false,
    months: months(65000), default_cents: 65000, exceptions: {}, amount_cents: null, due: null, bills: [],
    year_cents: 780000, covered_by_parent: false, counted: true, plan_cents: 780000, actual_cents: 760000,
    heading_cents: null, current: null, change_cents: null, changed: false, changed_since_copy: null, loans: [],
    ...extra,
  };
}

const CURRENT_PLAN = { id: null, year: 2027, kind: "current", name: "Current budget" };
const LEAN = { id: 7, year: 2027, kind: "draft", name: "Lean", from_month: 1, applied_at: null };

function view(extra = {}) {
  return {
    plan: CURRENT_PLAN,
    year: 2027,
    from_month: 1,
    actual: { kind: "last_12", from: "2025-11-01", until: "2026-10-31" },
    split_month: null,
    income: [{ id: 4, name: "Salary", amount_cents: 320000, per: "month", extra: {}, category_id: 3, plan_cents: 3840000, actual_cents: 3800000, heading_cents: null }],
    rows: [row(), row({ category_id: 2, category_name: "Holidays", months: months(25000), default_cents: 25000, plan_cents: 300000, actual_cents: 250000 })],
    not_in_plan_cents: 310000,
    totals: {
      income_cents: 3840000, expenses_cents: 1080000, left_cents: 2760000, share: 72,
      actual_income_cents: 3800000, actual_expenses_cents: 1320000, change_left_cents: null, heading_left_cents: null,
    },
    has_income: true,
    has_budgets: true,
    ...extra,
  };
}

function draftView(extra = {}) {
  return view({
    plan: LEAN,
    rows: [
      row({
        default_cents: 60000, months: months(60000), plan_cents: 720000, changed: true, change_cents: -60000,
        current: { kind: "monthly", plan_cents: 780000, display_cents: 65000 },
      }),
      row({
        category_id: 2, category_name: "Holidays", months: months(25000), default_cents: 25000, plan_cents: 300000,
        current: { kind: "monthly", plan_cents: 300000, display_cents: 25000 },
      }),
    ],
    totals: { ...view().totals, left_cents: 2820000, change_left_cents: 60000 },
    ...extra,
  });
}

const LIST = { year: 2027, first_year: 2025, last_year: 2027, can_draft: true, drafts: [], history: [] };

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.search}</p>;
}

function renderPage(path) {
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 24));
  categoriesApi.listCategories.mockResolvedValue(CATEGORIES);
  budgetsApi.getBudgetSummary.mockResolvedValue({
    categories: [], uncategorized_spent_cents: 0, yearly_spent_cents: 0,
    yearly: { year: 2026, through: "2026-10-24", start_month: null, starts: null, categories: [] },
    totals: { has_limits: false, limit_cents: 0, spent_cents: 0, outside_cents: 0, yearly_spent_cents: 0, uncategorized_cents: 0, marker: null },
    pace: null, days_left: 8, attention: { categories: [], yearly: [] },
  });
  plansApi.listPlans.mockResolvedValue(LIST);
  plansApi.getCurrentPlan.mockResolvedValue(view());
  plansApi.getPlan.mockResolvedValue(draftView());
  plansApi.getIncomeSuggestions.mockResolvedValue({ suggestions: [] });
});
afterEach(() => vi.useRealTimers());

describe("Month and Year views", () => {
  it("goes from October to the year and back", async () => {
    renderPage("/budgets?month=2026-10");
    await userEvent.click(await screen.findByRole("button", { name: "Year" }));

    expect(screen.getByTestId("where")).toHaveTextContent("?view=year&year=2026");
    await waitFor(() => expect(plansApi.getCurrentPlan).toHaveBeenCalledWith(2026));
    await userEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(screen.getByTestId("where")).toHaveTextContent("?month=2026-10");
  });

  it("opens a link to the Year view of 2027", async () => {
    renderPage("/budgets?view=year&year=2027");

    expect(await screen.findByText("2027")).toBeInTheDocument();
    expect(plansApi.getCurrentPlan).toHaveBeenCalledWith(2027);
  });

  it("plans next year but no further", async () => {
    renderPage("/budgets?view=year&year=2026");
    await waitFor(() => expect(plansApi.listPlans).toHaveBeenCalledWith(2026));

    await userEvent.click(screen.getByRole("button", { name: "Next year" }));
    expect(screen.getByTestId("where")).toHaveTextContent("year=2027");
    await waitFor(() => expect(screen.getByRole("button", { name: "Next year" })).toBeDisabled());
  });

  it("holds the year and plan in the address", async () => {
    plansApi.listPlans.mockResolvedValue({ ...LIST, drafts: [LEAN] });
    renderPage("/budgets?view=year&year=2027");

    await userEvent.click(await screen.findByRole("button", { name: "Lean" }));

    expect(screen.getByTestId("where")).toHaveTextContent("?view=year&year=2027&plan=7");
    await waitFor(() => expect(plansApi.getPlan).toHaveBeenCalledWith(7));
  });
});

describe("Current budget", () => {
  it("shows the real budget with left to save", async () => {
    renderPage("/budgets?view=year&year=2027");

    expect(await screen.findByText(whole(2760000))).toBeInTheDocument();
    expect(screen.getByText(/72% of/)).toBeInTheDocument();
    expect(screen.getByText("Plan only")).toBeInTheDocument();
    expect(screen.getByText("Last 12 mo (Nov–Oct)")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Draft" })).toBeNull();
  });

  it("opens a row read-only, offering a new draft", async () => {
    plansApi.createPlan.mockResolvedValue({ ...LEAN, name: "2027 plan" });
    renderPage("/budgets?view=year&year=2027");
    await userEvent.click(await screen.findByRole("button", { name: "Open Groceries" }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).queryByRole("button", { name: /Save/ })).toBeNull();
    expect(within(sheet).getByRole("link", { name: "Open in month view" })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Change in a new draft" }));

    expect(plansApi.createPlan).toHaveBeenCalledWith({ year: 2027 });
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("plan=7&category=1"));
  });

  it("says when a plan is short of income", async () => {
    plansApi.getCurrentPlan.mockResolvedValue(
      view({ totals: { ...view().totals, income_cents: 4260000, expenses_cents: 4400000, left_cents: -140000, share: -3 } }),
    );
    renderPage("/budgets?view=year&year=2027");

    expect(await screen.findByText("Short of income")).toBeInTheDocument();
    expect(screen.getByText(whole(140000))).toHaveClass("text-critical");
  });

  it("asks for income on a first visit", async () => {
    plansApi.getCurrentPlan.mockResolvedValue(view({ income: [], has_income: false }));
    renderPage("/budgets?view=year&year=2027");

    expect(await screen.findByText("Add income to see what's left to save.", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("planned expenses")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Add income line" })).toBeInTheDocument();
  });

  it("suggests income from the forecast", async () => {
    plansApi.getCurrentPlan.mockResolvedValue(view({ income: [], has_income: false }));
    plansApi.getIncomeSuggestions.mockResolvedValue({
      suggestions: [{ name: "Salary", amount_cents: 320000, per: "month", category: 3, source: "forecast" }],
    });
    plansApi.addIncomeLine.mockResolvedValue({ id: 9 });
    renderPage("/budgets?view=year&year=2027");

    await userEvent.click(await screen.findByRole("button", { name: "Add" }));

    expect(plansApi.addIncomeLine).toHaveBeenCalledWith({ year: 2027 }, { name: "Salary", amount_cents: 320000, per: "month", category: 3 });
  });

  it("says when there is nothing to plan yet", async () => {
    plansApi.getCurrentPlan.mockResolvedValue(view({ income: [], rows: [], has_income: false, has_budgets: false }));
    renderPage("/budgets?view=year&year=2027");

    expect(await screen.findByText(/Nothing to plan yet/)).toBeInTheDocument();
  });

  it("offers no new draft for a past year", async () => {
    plansApi.listPlans.mockResolvedValue({ ...LIST, year: 2025, can_draft: false });
    renderPage("/budgets?view=year&year=2025");

    await screen.findByText(whole(2760000));
    expect(screen.queryByRole("button", { name: "New draft" })).toBeNull();
  });
});

describe("Drafts", () => {
  beforeEach(() => plansApi.listPlans.mockResolvedValue({ ...LIST, drafts: [{ ...LEAN, name: "New car", id: 8 }, LEAN] }));

  it("lists the drafts as chips after Current", async () => {
    renderPage("/budgets?view=year&year=2027");

    const chips = await screen.findByLabelText("Plans");
    await waitFor(() =>
      expect(within(chips).getAllByRole("button", { pressed: false }).map((b) => b.textContent)).toEqual(["New car", "Lean"]),
    );
  });

  it("marks a draft and shows its changes against Current", async () => {
    renderPage("/budgets?view=year&year=2027&plan=7");

    const bar = await screen.findByRole("region", { name: "Draft" });
    expect(within(bar).getByText(/not your budget yet/)).toBeInTheDocument();
    expect(screen.getByText(`${whole(60000, { signed: true })} vs Current`)).toBeInTheDocument();
    const groceries = screen.getByRole("button", { name: "Open Groceries" });
    expect(within(groceries).getByText(whole(780000))).toHaveClass("line-through");
    expect(within(groceries).getAllByText(whole(-60000, { signed: true })).length).toBeGreaterThan(0);
    const holidays = screen.getByRole("button", { name: "Open Holidays" });
    expect(within(holidays).queryByText(/\+|−|-€/)).toBeNull();
  });

  it("flags a row whose budget changed since the copy", async () => {
    plansApi.getPlan.mockResolvedValue(
      draftView({ rows: [row({ changed_since_copy: { from_cents: 12000, to_cents: 14000 } })] }),
    );
    plansApi.takeCurrentIntoPlan.mockResolvedValue({});
    renderPage("/budgets?view=year&year=2027&plan=7");

    expect(await screen.findByText(/Budget changed €120 → €140 since the copy/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open Groceries" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Use €140" }));
    expect(plansApi.takeCurrentIntoPlan).toHaveBeenCalledWith(7, 1);
  });

  it("edits a row in the draft", async () => {
    plansApi.setPlanBudget.mockResolvedValue({});
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Open Groceries" }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Editing draft Lean")).toBeInTheDocument();
    const amount = within(sheet).getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "600");
    await userEvent.click(within(sheet).getByRole("button", { name: "Different amount in some months" }));
    await userEvent.type(within(sheet).getByLabelText("December"), "800");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save to draft" }));

    expect(plansApi.setPlanBudget).toHaveBeenCalledWith(7, 1, { kind: "monthly", default_cents: 60000, months: { 12: 80000 } });
  });

  it("resets a month back to the default", async () => {
    plansApi.getPlan.mockResolvedValue(draftView({ rows: [row({ exceptions: { 12: 80000 } })] }));
    plansApi.setPlanBudget.mockResolvedValue({});
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Open Groceries" }));

    const sheet = screen.getByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "Reset December" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save to draft" }));

    expect(plansApi.setPlanBudget).toHaveBeenCalledWith(7, 1, { kind: "monthly", default_cents: 65000, months: {} });
  });

  it("warns when the kind switches", async () => {
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Open Holidays" }));

    const sheet = screen.getByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "Yearly" }));

    expect(within(sheet).getByRole("note")).toHaveTextContent(
      "Applying this makes Holidays yearly for every month, earlier ones included, and its monthly amounts go.",
    );
  });

  it("keeps earlier months read-only when correcting mid-year", async () => {
    plansApi.getPlan.mockResolvedValue(draftView({ plan: { ...LEAN, from_month: 7 } }));
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Open Groceries" }));

    const sheet = screen.getByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "Different amount in some months" }));
    expect(within(sheet).queryByLabelText("June")).toBeNull();
    expect(within(sheet).getByLabelText("July")).toBeInTheDocument();
    expect(within(sheet).getByText("Before July: the real budget.")).toBeInTheDocument();
  });

  it("sets a bill to end in December", async () => {
    plansApi.getPlan.mockResolvedValue(
      draftView({ rows: [row({ category_id: 2, category_name: "Gym", kind: "bills", bills: [{ name: "Gym", day: 1, amount_cents: 3000, from_month: 1, until_month: null }] })] }),
    );
    plansApi.setPlanBills.mockResolvedValue({});
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Open Gym" }));

    const sheet = screen.getByRole("dialog");
    await userEvent.click(within(sheet).getByRole("combobox", { name: "Last month" }));
    await userEvent.click(screen.getByRole("option", { name: "until Dec" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save to draft" }));

    expect(plansApi.setPlanBills).toHaveBeenCalledWith(7, 2, [{ name: "Gym", day: 1, amount_cents: 3000, from_month: 1, until_month: 12 }]);
  });

  it("adds a real category from the draft", async () => {
    plansApi.addPlanCategory.mockResolvedValue({ id: 11, name: "Car fund" });
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Add category" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("added to your categories now and stays if you delete this draft");
    await userEvent.type(within(dialog).getByLabelText("Category name"), "Car fund");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));

    expect(plansApi.addPlanCategory).toHaveBeenCalledWith(7, "Car fund");
  });

  it("deletes a draft from its menu", async () => {
    plansApi.deletePlan.mockResolvedValue(null);
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Lean actions" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete draft" }));

    expect(plansApi.deletePlan).toHaveBeenCalledWith(7);
    await waitFor(() => expect(screen.getByTestId("where")).not.toHaveTextContent("plan="));
    expect(screen.getByTestId("where")).toHaveTextContent("?view=year&year=2027");
  });
});

describe("Applying", () => {
  const PREVIEW = {
    from_month: 1,
    changes: [
      {
        category_id: 2, category_name: "Holidays", from_kind: "monthly", to_kind: "yearly",
        kind_switch: { removes: { defaults: 1, overrides: 0, yearly_years: 0, bills: 0 } },
        remove: false, give: false, from_cents: null, to_cents: 300000, per: "year", exceptions: null, bills: null,
      },
      {
        category_id: 1, category_name: "Groceries", from_kind: "monthly", to_kind: "monthly", kind_switch: null,
        remove: false, give: false, from_cents: 65000, to_cents: 60000, per: "month", exceptions: null, bills: null,
      },
    ],
    income: null,
    part_spent_cents: null,
    nothing_to_apply: false,
    changed_since_copy: [{ category_id: 5, category_name: "Transport", from_cents: 12000, to_cents: 14000, draft_cents: 12000 }],
  };

  it("previews Lean, kind switches first", async () => {
    plansApi.previewApply.mockResolvedValue(PREVIEW);
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Apply…" }));

    const dialog = screen.getByRole("dialog");
    const items = await within(dialog).findAllByRole("listitem");
    expect(items[0]).toHaveTextContent(`Holidays becomes yearly ${whole(300000)}`);
    expect(items[0]).toHaveTextContent("its monthly limits go");
    expect(items[1]).toHaveTextContent(`${whole(65000)} → ${whole(60000)} a month`);
    expect(dialog).toHaveTextContent(`Transport: the draft keeps ${whole(12000)}, the budget has ${whole(14000)} now.`);
    expect(plansApi.previewApply).toHaveBeenCalledWith(7, 1);
  });

  it("changes nothing on Cancel", async () => {
    plansApi.previewApply.mockResolvedValue(PREVIEW);
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Apply…" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(plansApi.applyPlan).not.toHaveBeenCalled();
  });

  it("says when there is nothing to apply", async () => {
    plansApi.previewApply.mockResolvedValue({ ...PREVIEW, changes: [], changed_since_copy: [], nothing_to_apply: true });
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Apply…" }));

    expect(await screen.findByText(/Nothing to apply/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply from/ })).toBeNull();
  });

  it("warns about a month under way", async () => {
    vi.setSystemTime(new Date(2027, 5, 14));
    plansApi.listPlans.mockResolvedValue({ ...LIST, last_year: 2028 });
    plansApi.getPlan.mockResolvedValue(draftView({ plan: { ...LEAN, from_month: 6 } }));
    plansApi.previewApply.mockResolvedValue({ ...PREVIEW, from_month: 6, part_spent_cents: 42000 });
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Apply…" }));

    expect(await screen.findByText(`June is under way. ${whole(42000)} already spent counts against the new amounts.`, { exact: false }))
      .toBeInTheDocument();
  });

  it("lands on Current after applying", async () => {
    plansApi.previewApply.mockResolvedValue(PREVIEW);
    plansApi.applyPlan.mockResolvedValue({});
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Apply…" }));
    await userEvent.click(await screen.findByRole("button", { name: "Apply from January" }));

    expect(plansApi.applyPlan).toHaveBeenCalledWith(7, 1);
    expect(await screen.findByText("Lean applied from January 2027.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open January" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("where")).not.toHaveTextContent("plan="));
  });

  it("keeps the dialog open when applying fails", async () => {
    plansApi.previewApply.mockResolvedValue(PREVIEW);
    plansApi.applyPlan.mockRejectedValue(Object.assign(new Error("x"), { data: { detail: "Something went wrong." } }));
    renderPage("/budgets?view=year&year=2027&plan=7");
    await userEvent.click(await screen.findByRole("button", { name: "Apply…" }));
    await userEvent.click(await screen.findByRole("button", { name: "Apply from January" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps an applied draft as a record", async () => {
    const applied = { ...LEAN, kind: "applied", from_month: 7, applied_at: "2027-06-12T09:00:00Z", name: "Rest of 2027" };
    plansApi.listPlans.mockResolvedValue({ ...LIST, history: [applied] });
    plansApi.getPlan.mockResolvedValue(draftView({ plan: applied }));
    renderPage("/budgets?view=year&year=2027");
    await userEvent.click(await screen.findByRole("button", { name: /History/ }));
    await userEvent.click(screen.getByRole("button", { name: /Rest of 2027/ }));

    expect(await screen.findByText(/^Applied (12 Jun|Jun 12), from July$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Draft" })).toBeNull();
  });
});

describe("Ways in from the month view", () => {
  it("plans the rest of the year", async () => {
    plansApi.createPlan.mockResolvedValue({ ...LEAN, id: 12, name: "Rest of 2026" });
    renderPage("/budgets");
    await userEvent.click(await screen.findByRole("button", { name: "Plan the rest of the year" }));

    expect(plansApi.createPlan).toHaveBeenCalledWith({ year: 2026 });
  });

  it("offers Plan 2027 from November", async () => {
    vi.setSystemTime(new Date(2026, 10, 16));
    plansApi.listPlans.mockResolvedValue({ ...LIST, drafts: [] });
    renderPage("/budgets");

    expect(await screen.findByRole("link", { name: "Plan 2027 →" })).toHaveAttribute("href", "/budgets?view=year&year=2027");
    expect(plansApi.listPlans).toHaveBeenCalledWith(2027);
  });

  it("continues planning once a draft exists", async () => {
    vi.setSystemTime(new Date(2026, 10, 16));
    plansApi.listPlans.mockResolvedValue({ ...LIST, drafts: [LEAN] });
    renderPage("/budgets");

    expect(await screen.findByRole("link", { name: "Continue planning 2027 · Lean →" })).toHaveAttribute(
      "href",
      "/budgets?view=year&year=2027&plan=7",
    );
  });

  it("offers neither once 2027 is planned", async () => {
    vi.setSystemTime(new Date(2026, 10, 16));
    plansApi.listPlans.mockResolvedValue({ ...LIST, history: [{ ...LEAN, kind: "applied" }] });
    renderPage("/budgets");

    await screen.findByRole("button", { name: "Plan the rest of the year" });
    await waitFor(() => expect(plansApi.listPlans).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /Plan 2027|Continue planning/ })).toBeNull();
  });

  it("has no Plan the rest of the year in December", async () => {
    vi.setSystemTime(new Date(2026, 11, 3));
    renderPage("/budgets");

    await screen.findByRole("button", { name: "Year" });
    await waitFor(() => expect(budgetsApi.getBudgetSummary).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Plan the rest of the year" })).toBeNull();
  });
});

// jsdom has no matchMedia, so these render at phone width.
describe("Year plans on a phone", () => {
  it("shows a draft's rows with their change, the bar above the tab bar", async () => {
    renderPage("/budgets?view=year&year=2027&plan=7");

    const bar = await screen.findByRole("region", { name: "Draft" });
    expect(bar).toHaveClass("fixed");
    expect(screen.getByText("Plan · Change")).toBeInTheDocument();
  });

  it("lifts notifications above the draft bar", async () => {
    const { unmount } = renderPage("/budgets?view=year&year=2027&plan=7");
    await screen.findByRole("region", { name: "Draft" });

    expect(document.documentElement.style.getPropertyValue("--toast-lift")).toBe("4rem");
    unmount();
    expect(document.documentElement.style.getPropertyValue("--toast-lift")).toBe("");
  });

  it("shows Actual on Current", async () => {
    renderPage("/budgets?view=year&year=2027");

    expect(await screen.findByText("Plan · Last 12 mo (Nov–Oct)")).toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ForecastingPage } from "./ForecastingPage";
import { ToastProvider } from "../components/ui/Toast";
import { longDay } from "../components/ForecastChart";
import * as forecastingApi from "../api/forecasting";
import { formatDayMonth } from "../lib/yearlyBudgets";

vi.mock("../api/forecasting", () => ({
  getForecast: vi.fn(),
  listExpectedItems: vi.fn(),
  getExpectedItemOptions: vi.fn(),
  createExpectedItem: vi.fn(),
  updateExpectedItem: vi.fn(),
  deleteExpectedItem: vi.fn(),
}));

function days(from, values) {
  const [y, m, d] = from.split("-").map(Number);
  return values.map((balance_cents, i) => {
    const day = new Date(y, m - 1, d + i);
    return {
      date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
      balance_cents,
    };
  });
}

// 12 Nov to 10 Feb: €1,840 today, €312 on 27 Nov, €2,105 at the end.
function line(low = 31200) {
  const values = Array.from({ length: 91 }, (_, i) => (i === 0 ? 184000 : i < 15 ? 160000 : i === 15 ? low : 210500));
  return days("2026-11-12", values);
}

const SPOTIFY = {
  date: "2026-11-21", amount_cents: -1099, name: "Spotify", source: "bill",
  detail: { category: "Streaming" }, late_since: null, link: { category: 7, month: "2026-11-01" },
};
const DISNEY = {
  date: "2026-11-13", amount_cents: -1199, name: "Disney+", source: "bill",
  detail: { category: "Streaming" }, late_since: "2026-11-08", link: { category: 7, month: "2026-11-01" },
};
const GROCERIES = {
  date: "2026-11-13", amount_cents: -22000, name: "Groceries", source: "budget",
  detail: { kind: "monthly", total_cents: 22000, until: "2026-11-30" }, late_since: null,
  link: { category: 3, month: "2026-11-01" },
};
const HOUSE = {
  date: "2026-12-02", amount_cents: -90000, name: "House A", source: "installment",
  detail: { loan: "House A", number: 2, of: 300 }, late_since: null, link: { account: 9, installment: 2 },
};
const SALARY_ITEM = {
  date: "2026-11-25", amount_cents: 450000, name: "Salary", source: "expected",
  detail: { category: "Salary", account: null }, late_since: null, link: { expected: 1 },
};

function forecast(overrides = {}) {
  const points = line();
  return {
    tier: "everyday", start_balance_cents: 184000, horizon_days: 90, points, lowest: points[15],
    items: [DISNEY, GROCERIES, SPOTIFY, SALARY_ITEM, HOUSE], missed: [], has_income: true, accounts: [],
    ...overrides,
  };
}

const SALARY = {
  id: 1, name: "Salary", direction: "in", amount_cents: 450000, day: 25, category: 5, account: null,
  status: "received", received_on: "2026-11-24", next_on: "2026-12-25",
};
const OPTIONS = {
  categories: [{ id: 5, name: "Salary", parent: null, parent_name: null }],
  accounts: [{ id: 8, name: "Spaarrekening", tier: "savings" }],
};

function Where() {
  return <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;
}

function renderPage(path = "/forecast") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Routes>
          <Route path="/forecast" element={<ForecastingPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 10));
  forecastingApi.getForecast.mockResolvedValue(forecast());
  forecastingApi.listExpectedItems.mockResolvedValue([SALARY]);
  forecastingApi.getExpectedItemOptions.mockResolvedValue(OPTIONS);
  forecastingApi.createExpectedItem.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

function stat(label) {
  return screen.getByText(label).closest("div").parentElement;
}

describe("The Forecast page", () => {
  it("shows three figures with their dates and no account choice (Opening Forecast)", async () => {
    renderPage();
    await screen.findByText("Lowest");
    expect(forecastingApi.getForecast).toHaveBeenCalledWith(90);
    expect(within(stat("Today")).getByText("€1,840")).toBeInTheDocument();
    expect(within(stat("Today")).getByText(longDay("2026-11-12"))).toBeInTheDocument();
    expect(within(stat("Lowest")).getByText("€312")).toBeInTheDocument();
    expect(within(stat("Lowest")).getByText(formatDayMonth("2026-11-27"))).toBeInTheDocument();
    expect(within(stat("In 90 days")).getByText("€2,105")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Account" })).toBeNull();
    expect(screen.getByText(/Spending without a budget isn't included/)).toBeInTheDocument();
  });

  it("opens over 30 days from the address (A link to 30 days)", async () => {
    forecastingApi.getForecast.mockResolvedValue(forecast({ horizon_days: 30, points: line().slice(0, 31) }));
    renderPage("/forecast?days=30");
    await screen.findByText("In 30 days");
    expect(forecastingApi.getForecast).toHaveBeenCalledWith(30);
    expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("says when an account is stale (A stale account)", async () => {
    const accounts = [{ id: 1, name: "Crelan", tier: "everyday", account_type: "checking", last_import_date: "2026-10-31" }];
    forecastingApi.getForecast.mockResolvedValue(forecast({ accounts }));
    renderPage();
    expect(await screen.findByText("Crelan: last import 12 days ago")).toHaveClass("text-warning");
  });

  it("makes Lowest critical below zero when income is expected", async () => {
    const points = line(-15000);
    forecastingApi.getForecast.mockResolvedValue(forecast({ points, lowest: points[15] }));
    renderPage();
    expect(await screen.findByText("-€150")).toHaveClass("text-critical");
  });

  it("explains a forecast without income and stays calm (Only out items)", async () => {
    const points = line(-15000);
    forecastingApi.getForecast.mockResolvedValue(forecast({ points, lowest: points[15], has_income: false }));
    forecastingApi.listExpectedItems.mockResolvedValue([{ ...SALARY, direction: "out", name: "Savings", status: "next" }]);
    renderPage();
    expect(await screen.findByText(/Only money going out is counted/)).toBeInTheDocument();
    expect(screen.getByText("-€150")).not.toHaveClass("text-critical");

    await userEvent.click(screen.getByRole("button", { name: "Add expected income" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "In" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an empty state instead of a chart (A new household)", async () => {
    const points = days("2026-11-12", Array(91).fill(184000));
    forecastingApi.getForecast.mockResolvedValue(forecast({ points, lowest: points[1], items: [], has_income: false }));
    forecastingApi.listExpectedItems.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText("Nothing expected in the next 90 days.")).toBeInTheDocument();
    expect(screen.queryByText("Lowest")).toBeNull();
    expect(screen.queryByText("Coming up")).toBeNull();
    expect(screen.queryByText(/Only money going out is counted/)).toBeNull();
  });
});

describe("Coming up", () => {
  async function comingUp() {
    renderPage();
    return within((await screen.findByRole("heading", { name: "Coming up" })).closest("section"));
  }

  it("groups items by day with the balance after it (A day in the list)", async () => {
    const list = await comingUp();
    const header = list.getByText(longDay("2026-11-21")).parentElement;
    expect(within(header).getByText("€1,600")).toBeInTheDocument();
    const row = list.getByText("Spotify").closest("a");
    expect(within(row).getByText("Bill · Streaming")).toBeInTheDocument();
    expect(within(row).getByText("-€10.99")).toBeInTheDocument();
    expect(within(list.getByText("Salary").closest("button")).getByText("+€4,500.00")).toHaveClass("text-positive");
  });

  it("lists a spread budget once (Spread budgets)", async () => {
    const list = await comingUp();
    const row = list.getByText("Groceries").closest("a");
    expect(within(row).getByText(`Budget · €220 left, spread to ${formatDayMonth("2026-11-30")}`)).toBeInTheDocument();
    expect(within(row).getByText("-€220.00")).toBeInTheDocument();
  });

  it("opens where an item is kept", async () => {
    const list = await comingUp();
    expect(list.getByText("Spotify").closest("a")).toHaveAttribute("href", "/budgets?month=2026-11&category=7");
    expect(list.getByText("Groceries").closest("a")).toHaveAttribute("href", "/budgets?month=2026-11&category=3");
    expect(list.getByText("House A").closest("a")).toHaveAttribute("href", "/transactions/9/schedule?installment=2");

    await userEvent.click(list.getByText("Salary").closest("button"));
    expect(within(screen.getByRole("dialog")).getByDisplayValue("Salary")).toBeInTheDocument();
  });

  it("marks a late bill (A late bill)", async () => {
    const list = await comingUp();
    const row = list.getByText("Disney+").closest("a");
    expect(within(row).getByText("Not seen")).toBeInTheDocument();
    expect(within(row).getByText(`Bill · Streaming · due ${formatDayMonth("2026-11-08")}`)).toBeInTheDocument();
  });

  it("greys a missed bill (A missed bill)", async () => {
    const missed = { ...SPOTIFY, date: "2026-11-05", name: "Netflix", amount_cents: -1799 };
    forecastingApi.getForecast.mockResolvedValue(forecast({ missed: [missed] }));
    const list = await comingUp();
    const row = list.getByText("Netflix").closest("a");
    expect(row).toHaveClass("opacity-60");
    expect(within(row).getByText("Missed · not counted")).toBeInTheDocument();
  });
});

describe("The Expected panel", () => {
  it("says when an item came (Salary received)", async () => {
    renderPage();
    const panel = within((await screen.findByRole("heading", { name: "Expected" })).closest("section"));
    const row = panel.getByText("Salary").closest("button");
    expect(within(row).getByText("25")).toBeInTheDocument();
    expect(within(row).getByText("+€4,500")).toBeInTheDocument();
    expect(within(row).getByText(`Received ${formatDayMonth("2026-11-24")}`)).toBeInTheDocument();
  });

  it("asks for income when there is none (No expected items yet)", async () => {
    forecastingApi.listExpectedItems.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Income such as your salary goes here/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add expected income" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "In" })).toHaveAttribute("aria-pressed", "true");
  });

  it("adds salary from the sheet (Adding salary)", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Add item" }));
    const sheet = within(screen.getByRole("dialog"));
    await userEvent.click(sheet.getByRole("button", { name: "In" }));
    await userEvent.type(sheet.getByLabelText("Name"), "Salary");
    await userEvent.type(sheet.getByLabelText("About"), "4500");
    await userEvent.type(sheet.getByLabelText("Day"), "25");
    await userEvent.click(sheet.getByRole("button", { name: "Recognise by" }));
    await userEvent.click(await screen.findByRole("option", { name: "Salary" }));
    expect(sheet.getByText("Counts as received when money comes in here this month.")).toBeInTheDocument();
    await userEvent.click(sheet.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(forecastingApi.createExpectedItem).toHaveBeenCalledWith({
        name: "Salary", direction: "in", amount_cents: 450000, day: 25, category: 5, account: null,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(forecastingApi.getForecast).toHaveBeenCalledTimes(2);
  });

  it("offers only the allowed categories, then accounts (Budgeted categories aren't offered)", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Add item" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Recognise by" }));
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names).toContain("Salary");
    expect(names).toContain("→ Spaarrekening");
    expect(names).not.toContain("Streaming");
  });
});

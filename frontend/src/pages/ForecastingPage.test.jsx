import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ForecastingPage } from "./ForecastingPage";
import { ToastProvider } from "../components/ui/Toast";
import * as accountsApi from "../api/accounts";
import * as categoriesApi from "../api/categories";
import * as forecastingApi from "../api/forecasting";

vi.mock("../api/accounts", async () => {
  const actual = await vi.importActual("../api/accounts");
  return { ...actual, listAccounts: vi.fn() };
});

vi.mock("../api/categories", async () => {
  const actual = await vi.importActual("../api/categories");
  return { ...actual, listCategories: vi.fn() };
});

vi.mock("../api/forecasting", async () => {
  const actual = await vi.importActual("../api/forecasting");
  return {
    ...actual,
    listRecurringTransactions: vi.fn(),
    createRecurringTransaction: vi.fn(),
    updateRecurringTransaction: vi.fn(),
    deleteRecurringTransaction: vi.fn(),
    getForecast: vi.fn(),
  };
});

const ACCOUNTS = [{ id: 1, name: "Main Checking" }];
const RECURRING = [
  { id: 1, payee: "Rent", amount_cents: -100000, frequency: "monthly", start_date: "2026-01-01", end_date: null, category: null },
  { id: 2, payee: "Gym", amount_cents: -5000, frequency: "monthly", start_date: "2026-01-01", end_date: null, category: null },
];
const FORECAST = { points: [], occurrences: [] };

function renderPage() {
  return render(
    <ToastProvider>
      <ForecastingPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  accountsApi.listAccounts.mockResolvedValue(ACCOUNTS);
  categoriesApi.listCategories.mockResolvedValue([]);
  forecastingApi.getForecast.mockResolvedValue(FORECAST);
});

describe("ForecastingPage", () => {
  it("disables a recurring transaction's Edit/Delete buttons immediately on Delete", async () => {
    forecastingApi.listRecurringTransactions.mockResolvedValue(RECURRING);
    let resolveDelete;
    forecastingApi.deleteRecurringTransaction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );

    renderPage();
    await screen.findByText("Rent");

    const [deleteRent] = screen.getAllByRole("button", { name: "Delete" });
    const [editRent] = screen.getAllByRole("button", { name: "Edit" });
    await userEvent.click(deleteRent);

    expect(deleteRent).toBeDisabled();
    expect(editRent).toBeDisabled();

    forecastingApi.listRecurringTransactions.mockResolvedValue([RECURRING[1]]);
    resolveDelete({});

    await waitFor(() => expect(screen.queryByText("Rent")).not.toBeInTheDocument());
    expect(screen.getByText("Gym")).toBeInTheDocument();
  });

  it("picks a recurring transaction's category by typing and Tab", async () => {
    categoriesApi.listCategories.mockResolvedValue([{ id: 7, name: "Housing", parent: null }]);
    forecastingApi.listRecurringTransactions.mockResolvedValue([]);
    forecastingApi.createRecurringTransaction.mockResolvedValue({ id: 3 });
    renderPage();
    await userEvent.type(await screen.findByLabelText("Payee"), "Rent");
    await userEvent.type(screen.getByLabelText("Amount"), "-1500");

    screen.getByRole("button", { name: "Category" }).focus();
    await userEvent.keyboard("hous{Tab}");
    const submit = screen.getByRole("button", { name: "Add recurring transaction" });
    expect(submit).toHaveFocus();

    await userEvent.click(submit);
    await waitFor(() =>
      expect(forecastingApi.createRecurringTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ payee: "Rent", category: 7 }),
      ),
    );
  });
});

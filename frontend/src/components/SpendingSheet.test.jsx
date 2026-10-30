import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SpendingSheet } from "./SpendingSheet";
import { ToastProvider } from "./ui/Toast";
import * as reportsApi from "../api/reports";
import * as transactionsApi from "../api/transactions";

vi.mock("../api/reports", () => ({ getSpendingCell: vi.fn() }));
vi.mock("../api/transactions", () => ({ updateTransaction: vi.fn(), getReviewCount: vi.fn() }));

const ROW = {
  id: 5,
  date: "2026-09-12",
  payee: "Delhaize",
  amount_cents: -8640,
  account_id: 3,
  account_name: "Crelan",
  category: 1,
  category_label: "Groceries",
  split_amount_cents: null,
};
const CATEGORIES = [
  { id: 1, name: "Groceries", parent: null },
  { id: 2, name: "Household", parent: null },
];

function cell(overrides = {}) {
  return {
    month: "2026-09",
    name: "Groceries",
    uncategorized: false,
    total_cents: 8640,
    accounts: ["Crelan"],
    rows: [ROW],
    ...overrides,
  };
}

function renderSheet(props = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <SpendingSheet
          selection={{ category: 1, month: "2026-09" }}
          categories={CATEGORIES}
          wide
          onClose={() => {}}
          onChanged={() => {}}
          {...props}
        />
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function pickCategory(name) {
  await userEvent.click(screen.getByRole("button", { name: /Category for Delhaize/ }));
  await userEvent.click(await screen.findByRole("option", { name }));
}

beforeEach(() => {
  vi.clearAllMocks();
  reportsApi.getSpendingCell.mockResolvedValue(cell());
});

describe("SpendingSheet", () => {
  it("heads the rows with the figure, and adds them up", async () => {
    renderSheet();
    expect(await screen.findByRole("heading", { name: /Groceries · September 2026/ })).toBeInTheDocument();
    expect(screen.getByText("€86 · 1 transaction · Crelan")).toBeInTheDocument();
    expect(reportsApi.getSpendingCell).toHaveBeenCalledWith("2026-09", 1, { category: 1, month: "2026-09" });
  });

  it("links a row to its account's ledger on that month", async () => {
    renderSheet();
    expect(await screen.findByRole("link", { name: "Delhaize" })).toHaveAttribute(
      "href",
      "/transactions/3?from=2026-09-01&to=2026-09-30",
    );
  });

  it("shows a refund with a plus in the positive colour", async () => {
    reportsApi.getSpendingCell.mockResolvedValue(cell({ rows: [{ ...ROW, amount_cents: 1500 }] }));
    renderSheet();
    expect(await screen.findByText(/^\+/)).toHaveClass("text-positive");
  });

  it("shows a part of a split without a picker", async () => {
    reportsApi.getSpendingCell.mockResolvedValue(
      cell({ rows: [{ ...ROW, amount_cents: -4000, split_amount_cents: -6000 }] }),
    );
    renderSheet();
    expect(await screen.findByText(/Part of €60.00/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows a placeholder, then an error, without closing", async () => {
    let fail;
    reportsApi.getSpendingCell.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    renderSheet();
    expect(await screen.findByTestId("sheet-loading")).toBeInTheDocument();
    fail(new Error("boom"));
    expect(await screen.findByText("Couldn't load these transactions.")).toBeInTheDocument();
  });

  it("links Uncategorized to Review", async () => {
    reportsApi.getSpendingCell.mockResolvedValue(cell({ name: "Uncategorized", uncategorized: true }));
    renderSheet();
    expect(await screen.findByRole("link", { name: /Open Review/ })).toHaveAttribute("href", "/review");
  });

  it("moves a row, then refreshes the sheet and the report", async () => {
    const onChanged = vi.fn();
    transactionsApi.updateTransaction.mockResolvedValue({});
    renderSheet({ onChanged });
    await screen.findByRole("link", { name: "Delhaize" });
    reportsApi.getSpendingCell.mockResolvedValue(cell({ rows: [], total_cents: 0, accounts: [] }));

    await pickCategory("Household");

    expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(5, { category: 2 });
    expect(await screen.findByText("Nothing left here.")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it("keeps a row whose new category still belongs to the figure", async () => {
    transactionsApi.updateTransaction.mockResolvedValue({});
    renderSheet();
    await screen.findByRole("link", { name: "Delhaize" });
    reportsApi.getSpendingCell.mockResolvedValue(cell({ rows: [{ ...ROW, category: 2 }] }));

    await pickCategory("Household");

    await waitFor(() => expect(reportsApi.getSpendingCell).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("link", { name: "Delhaize" })).toBeInTheDocument();
  });

  it("keeps the old category and says so when a save fails", async () => {
    const onChanged = vi.fn();
    transactionsApi.updateTransaction.mockRejectedValue(new Error("nope"));
    renderSheet({ onChanged });
    await screen.findByRole("link", { name: "Delhaize" });

    await pickCategory("Household");

    expect(await screen.findByText(/Couldn't change the category of Delhaize/)).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /Category for Delhaize/ });
    expect(within(trigger).getByText("Groceries")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

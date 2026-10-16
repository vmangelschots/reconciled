import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TransactionsPage } from "./TransactionsPage";
import { ToastProvider } from "../components/ui/Toast";
import * as accountsApi from "../api/accounts";
import * as categoriesApi from "../api/categories";
import * as transactionsApi from "../api/transactions";

vi.mock("../api/accounts", async () => {
  const actual = await vi.importActual("../api/accounts");
  return { ...actual, listAccounts: vi.fn() };
});

vi.mock("../api/categories", async () => {
  const actual = await vi.importActual("../api/categories");
  return { ...actual, listCategories: vi.fn(), createCategory: vi.fn() };
});

vi.mock("../api/transactions", async () => {
  const actual = await vi.importActual("../api/transactions");
  return {
    ...actual,
    listTransactions: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
  };
});

const ACCOUNTS = [{ id: 1, name: "Main Checking" }];
const CATEGORIES = [{ id: 1, name: "Groceries", parent: null }];
const TRANSACTIONS = [
  { id: 1, date: "2026-10-01", payee: "Store A", category: null, amount_cents: -1000 },
  { id: 2, date: "2026-10-02", payee: "Store B", category: null, amount_cents: -2000 },
];

function renderPage() {
  return render(
    <ToastProvider>
      <TransactionsPage />
    </ToastProvider>,
  );
}

async function findTable() {
  return within(await screen.findByRole("table"));
}

beforeEach(() => {
  vi.clearAllMocks();
  accountsApi.listAccounts.mockResolvedValue(ACCOUNTS);
  categoriesApi.listCategories.mockResolvedValue(CATEGORIES);
});

describe("TransactionsPage", () => {
  it("keeps existing rows visible through a background reload (no placeholder reappears)", async () => {
    let resolveSecondLoad;
    transactionsApi.listTransactions
      .mockResolvedValueOnce(TRANSACTIONS)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondLoad = resolve;
          }),
      );
    transactionsApi.updateTransaction.mockResolvedValue({});

    renderPage();
    const tbl = await findTable();
    expect(tbl.getByText("Store A")).toBeInTheDocument();

    await userEvent.click(tbl.getAllByRole("button", { name: "Edit" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Store B")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();

    resolveSecondLoad(TRANSACTIONS);
    await waitFor(() => expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(2));
  });

  it("disables a row's Edit/Delete buttons immediately on Delete and removes the row once it resolves", async () => {
    transactionsApi.listTransactions.mockResolvedValue(TRANSACTIONS);
    let resolveDelete;
    transactionsApi.deleteTransaction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );

    renderPage();
    const tbl = await findTable();

    const [deleteStoreA] = tbl.getAllByRole("button", { name: "Delete" });
    const [editStoreA] = tbl.getAllByRole("button", { name: "Edit" });
    await userEvent.click(deleteStoreA);

    expect(deleteStoreA).toBeDisabled();
    expect(editStoreA).toBeDisabled();

    resolveDelete({});
    await waitFor(() => expect(within(screen.getByRole("table")).queryByText("Store A")).not.toBeInTheDocument());
    expect(within(screen.getByRole("table")).getByText("Store B")).toBeInTheDocument();
  });

  it("deleting calls the delete endpoint exactly once and does not trigger a list reload", async () => {
    transactionsApi.listTransactions.mockResolvedValue(TRANSACTIONS);
    transactionsApi.deleteTransaction.mockResolvedValue({});

    renderPage();
    const tbl = await findTable();
    await waitFor(() => expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1));

    await userEvent.click(tbl.getAllByRole("button", { name: "Delete" })[0]);

    await waitFor(() => expect(within(screen.getByRole("table")).queryByText("Store A")).not.toBeInTheDocument());
    expect(transactionsApi.deleteTransaction).toHaveBeenCalledTimes(1);
    expect(transactionsApi.deleteTransaction).toHaveBeenCalledWith(1);
    expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1);
  });
});

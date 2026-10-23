import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TransactionsPage } from "./TransactionsPage";
import { ToastProvider } from "../components/ui/Toast";
import * as accountsApi from "../api/accounts";
import * as categoriesApi from "../api/categories";
import * as transactionsApi from "../api/transactions";
import { ReviewCountProvider } from "../review/ReviewCountContext";

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
    linkTransfer: vi.fn(),
    getReviewCount: vi.fn(),
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

// Generous timeout: under a full parallel test run the first render can
// take longer than findByRole's 1s default.
async function findTable() {
  return within(await screen.findByRole("table", {}, { timeout: 5000 }));
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

  it("picks the add form's category by typing and Tab", async () => {
    transactionsApi.listTransactions.mockResolvedValue([]);
    transactionsApi.createTransaction.mockResolvedValue({ id: 3 });
    renderPage();
    await userEvent.type(await screen.findByLabelText("Amount"), "-12.50");
    await userEvent.type(screen.getByLabelText("Payee"), "Corner shop");

    screen.getByRole("button", { name: "Category" }).focus();
    await userEvent.keyboard("groc{Tab}");
    expect(screen.getByLabelText("Notes")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Category" })).toHaveTextContent("Groceries");

    await userEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    await waitFor(() =>
      expect(transactionsApi.createTransaction).toHaveBeenCalledWith(expect.objectContaining({ category: 1 })),
    );
  });

  it("filters the ledger by typing a category, and clears it with All", async () => {
    transactionsApi.listTransactions.mockResolvedValue(TRANSACTIONS);
    renderPage();
    await findTable();
    const filter = screen.getByRole("button", { name: "Filter by category" });

    filter.focus();
    await userEvent.keyboard("groc{Enter}");
    await waitFor(() =>
      expect(transactionsApi.listTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ category: 1 })),
    );

    filter.focus();
    await userEvent.keyboard("all{Enter}");
    await waitFor(() =>
      expect(transactionsApi.listTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ category: "" })),
    );
  });

  describe("inline category changes", () => {
    function rowPicker(payee) {
      const row = within(screen.getByRole("table")).getByText(payee).closest("tr");
      return within(row).getAllByRole("button")[0];
    }

    function pending() {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    it("shows the picked category before the save completes, without reloading", async () => {
      transactionsApi.listTransactions.mockResolvedValue(TRANSACTIONS);
      const update = pending();
      transactionsApi.updateTransaction.mockReturnValue(update.promise);
      renderPage();
      await findTable();
      await waitFor(() => expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1));

      rowPicker("Store A").focus();
      await userEvent.keyboard("groc{Enter}");

      expect(rowPicker("Store A")).toHaveTextContent("Groceries");
      expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(1, { category: 1 });

      update.resolve({});
      await screen.findByText("Category updated.");
      expect(rowPicker("Store A")).toHaveTextContent("Groceries");
      expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1);
    });

    it("restores the previous category when the save fails", async () => {
      transactionsApi.listTransactions.mockResolvedValue(TRANSACTIONS);
      transactionsApi.updateTransaction.mockRejectedValue(new Error("Server said no"));
      renderPage();
      await findTable();

      rowPicker("Store A").focus();
      await userEvent.keyboard("groc{Enter}");

      await screen.findByText("Server said no");
      expect(rowPicker("Store A")).not.toHaveTextContent("Groceries");
    });

    it("shows a created category immediately and keeps it once saved", async () => {
      transactionsApi.listTransactions.mockResolvedValue(TRANSACTIONS);
      const create = pending();
      categoriesApi.createCategory.mockReturnValue(create.promise);
      transactionsApi.updateTransaction.mockResolvedValue({});
      renderPage();
      await findTable();
      await waitFor(() => expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1));

      rowPicker("Store A").focus();
      await userEvent.keyboard("Pets{Enter}");

      expect(rowPicker("Store A")).toHaveTextContent("Pets");
      expect(transactionsApi.updateTransaction).not.toHaveBeenCalled();

      create.resolve({ id: 9, name: "Pets", parent: null });
      await waitFor(() => expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(1, { category: 9 }));
      await screen.findByText('Created "Pets" and assigned it.');
      expect(rowPicker("Store A")).toHaveTextContent("Pets");
      expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1);
    });

    it("drops the placeholder and restores the row when creating fails", async () => {
      transactionsApi.listTransactions.mockResolvedValue(TRANSACTIONS);
      categoriesApi.createCategory.mockRejectedValue(new Error("Name taken"));
      renderPage();
      await findTable();

      rowPicker("Store A").focus();
      await userEvent.keyboard("Pets{Enter}");

      await screen.findByText("Name taken");
      expect(rowPicker("Store A")).not.toHaveTextContent("Pets");
      expect(transactionsApi.updateTransaction).not.toHaveBeenCalled();
    });
  });

  describe("guessed categories", () => {
    const GUESSED = [
      {
        id: 1, date: "2026-10-01", payee: "Carrefour", category: 1, amount_cents: -1000,
        category_confirmed: false, category_source: "history",
      },
      {
        id: 2, date: "2026-10-02", payee: "Bakery", category: 1, amount_cents: -500,
        category_confirmed: true, category_source: "manual",
      },
    ];

    function rowPicker(payee) {
      const row = within(screen.getByRole("table")).getByText(payee).closest("tr");
      return within(row).getAllByRole("button")[0];
    }

    it("marks only unconfirmed rows, without changing the column width", async () => {
      transactionsApi.listTransactions.mockResolvedValue(GUESSED);
      renderPage();
      await findTable();

      expect(rowPicker("Carrefour")).toHaveAttribute("data-suggestion", "history");
      expect(rowPicker("Bakery")).not.toHaveAttribute("data-suggestion");
      for (const payee of ["Carrefour", "Bakery"]) {
        expect(rowPicker(payee)).toHaveClass("min-w-32");
        expect(rowPicker(payee).className).not.toMatch(/(^|\s)w-\d/);
      }
    });

    it("re-picking a guess with Enter confirms it at once, without a reload", async () => {
      transactionsApi.listTransactions.mockResolvedValue(GUESSED);
      transactionsApi.updateTransaction.mockResolvedValue({});
      renderPage();
      await findTable();
      await waitFor(() => expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1));

      rowPicker("Carrefour").focus();
      await userEvent.keyboard("{Enter}{Enter}");

      expect(rowPicker("Carrefour")).not.toHaveAttribute("data-suggestion");
      expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(1, { category: 1 });
      await screen.findByText("Category updated.");
      expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1);
    });

    it("confirming a guess refreshes the nav's Review count", async () => {
      transactionsApi.listTransactions.mockResolvedValue(GUESSED);
      transactionsApi.updateTransaction.mockResolvedValue({});
      transactionsApi.getReviewCount.mockResolvedValue({ count: 1 });
      render(
        <ToastProvider>
          <ReviewCountProvider>
            <TransactionsPage />
          </ReviewCountProvider>
        </ToastProvider>,
      );
      await findTable();
      await waitFor(() => expect(transactionsApi.getReviewCount).toHaveBeenCalledTimes(1));

      rowPicker("Carrefour").focus();
      await userEvent.keyboard("{Enter}{Enter}");

      await waitFor(() => expect(transactionsApi.getReviewCount).toHaveBeenCalledTimes(2));
    });

    it("a failed confirm turns the row back into a guess and shows the error", async () => {
      transactionsApi.listTransactions.mockResolvedValue(GUESSED);
      transactionsApi.updateTransaction.mockRejectedValue(new Error("Server said no"));
      renderPage();
      await findTable();

      rowPicker("Carrefour").focus();
      await userEvent.keyboard("{Enter}{Enter}");

      await screen.findByText("Server said no");
      expect(rowPicker("Carrefour")).toHaveAttribute("data-suggestion", "history");
      expect(rowPicker("Carrefour")).toHaveTextContent("Groceries");
    });
  });

  it("shows each transaction's notes in the ledger, with the full text as a tooltip", async () => {
    const long = "Birthday present for grandma, split with my sister - she pays me back next week";
    transactionsApi.listTransactions.mockResolvedValue([
      { ...TRANSACTIONS[0], notes: long },
      { ...TRANSACTIONS[1], notes: "" },
    ]);
    renderPage();
    const tbl = await findTable();

    expect(tbl.getByRole("columnheader", { name: "Notes" })).toBeInTheDocument();
    const cell = tbl.getByText(long);
    expect(cell).toHaveAttribute("title", long);
    // An empty note gets no tooltip.
    const storeB = tbl.getByText("Store B").closest("tr");
    expect(within(storeB).getAllByRole("cell")[2]).not.toHaveAttribute("title");
  });

  describe("transfers in the ledger", () => {
    const TWO_ACCOUNTS = [
      { id: 1, name: "Main Checking" },
      { id: 2, name: "Savings" },
    ];

    function rowPicker(payee) {
      const row = within(screen.getByRole("table")).getByText(payee).closest("tr");
      return within(row).getAllByRole("button")[0];
    }

    beforeEach(() => {
      accountsApi.listAccounts.mockResolvedValue(TWO_ACCOUNTS);
    });

    it("shows an existing transfer as → / ← the other account", async () => {
      transactionsApi.listTransactions.mockResolvedValue([
        { ...TRANSACTIONS[0], transfer: { counterpart_id: 9, account_id: 2, account_name: "Savings" } },
        {
          ...TRANSACTIONS[1],
          amount_cents: 2000,
          transfer: { counterpart_id: 8, account_id: 3, account_name: "Old savings" },
        },
      ]);
      renderPage();
      await findTable();

      expect(rowPicker("Store A")).toHaveTextContent("→ Savings");
      // An archived account isn't offered, but its name still shows.
      expect(rowPicker("Store B")).toHaveTextContent("← Old savings");
    });

    it("offers the other accounts only, not the current one", async () => {
      transactionsApi.listTransactions.mockResolvedValue(TRANSACTIONS);
      renderPage();
      await findTable();

      await userEvent.click(rowPicker("Store A"));

      expect(screen.getByText("→ Savings")).toBeInTheDocument();
      expect(screen.queryByText("→ Main Checking")).not.toBeInTheDocument();
    });

    it("marks a row as a transfer optimistically, without a reload", async () => {
      transactionsApi.listTransactions.mockResolvedValue(TRANSACTIONS);
      let resolveLink;
      transactionsApi.linkTransfer.mockReturnValue(new Promise((resolve) => (resolveLink = resolve)));
      renderPage();
      await findTable();
      await waitFor(() => expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1));

      rowPicker("Store A").focus();
      await userEvent.keyboard("sav{Enter}");

      expect(rowPicker("Store A")).toHaveTextContent("→ Savings");
      expect(transactionsApi.linkTransfer).toHaveBeenCalledWith(1, 2);

      resolveLink({
        transaction: { ...TRANSACTIONS[0], transfer: { counterpart_id: 9, account_id: 2, account_name: "Savings" } },
        counterpart: {},
      });
      await screen.findByText("Marked as a transfer with Savings.");
      expect(rowPicker("Store A")).toHaveTextContent("→ Savings");
      expect(transactionsApi.listTransactions).toHaveBeenCalledTimes(1);
    });

    it("puts the row back when linking fails", async () => {
      transactionsApi.listTransactions.mockResolvedValue([{ ...TRANSACTIONS[0], category: 1 }]);
      transactionsApi.linkTransfer.mockRejectedValue(new Error("Nope"));
      renderPage();
      await findTable();

      rowPicker("Store A").focus();
      await userEvent.keyboard("sav{Enter}");

      await screen.findByText("Nope");
      expect(rowPicker("Store A")).toHaveTextContent("Groceries");
    });

    it("picking a category for a transfer clears it on the row", async () => {
      transactionsApi.listTransactions.mockResolvedValue([
        { ...TRANSACTIONS[0], transfer: { counterpart_id: 9, account_id: 2, account_name: "Savings" } },
      ]);
      transactionsApi.updateTransaction.mockResolvedValue({});
      renderPage();
      await findTable();

      rowPicker("Store A").focus();
      await userEvent.keyboard("groc{Enter}");

      expect(rowPicker("Store A")).toHaveTextContent("Groceries");
      expect(rowPicker("Store A")).not.toHaveTextContent("Savings");
      expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(1, { category: 1 });
    });
  });

  describe("transfers in the transaction form", () => {
    beforeEach(() => {
      accountsApi.listAccounts.mockResolvedValue([
        { id: 1, name: "Main Checking" },
        { id: 2, name: "Savings" },
      ]);
    });

    it("adds a transaction and then links it as a transfer", async () => {
      transactionsApi.listTransactions.mockResolvedValue([]);
      transactionsApi.createTransaction.mockResolvedValue({ id: 30 });
      transactionsApi.linkTransfer.mockResolvedValue({ transaction: {}, counterpart: {} });
      renderPage();
      await userEvent.type(await screen.findByLabelText("Amount"), "-500");
      await userEvent.type(screen.getByLabelText("Payee"), "Monthly saving");

      screen.getByRole("button", { name: "Category" }).focus();
      await userEvent.keyboard("sav{Tab}");
      expect(screen.getByRole("button", { name: "Category" })).toHaveTextContent("→ Savings");
      await userEvent.click(screen.getByRole("button", { name: "Add transaction" }));

      await waitFor(() => expect(transactionsApi.linkTransfer).toHaveBeenCalledWith(30, 2));
      expect(transactionsApi.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ account: 1, category: null, amount_cents: -50000 }),
      );
      expect(transactionsApi.createTransaction.mock.invocationCallOrder[0]).toBeLessThan(
        transactionsApi.linkTransfer.mock.invocationCallOrder[0],
      );
    });

    it("saving a transfer without changing its target leaves out category and doesn't re-link", async () => {
      transactionsApi.listTransactions.mockResolvedValue([
        { ...TRANSACTIONS[0], notes: "", transfer: { counterpart_id: 9, account_id: 2, account_name: "Savings" } },
      ]);
      transactionsApi.updateTransaction.mockResolvedValue({});
      renderPage();
      const tbl = await findTable();

      await userEvent.click(tbl.getByRole("button", { name: "Edit" }));
      await userEvent.type(screen.getAllByLabelText("Notes").at(-1), "x");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(transactionsApi.updateTransaction).toHaveBeenCalled());
      expect(transactionsApi.updateTransaction.mock.calls[0][1]).not.toHaveProperty("category");
      expect(transactionsApi.linkTransfer).not.toHaveBeenCalled();
    });

    it("changing the transfer target in the edit form re-links it", async () => {
      accountsApi.listAccounts.mockResolvedValue([
        { id: 1, name: "Main Checking" },
        { id: 2, name: "Savings" },
        { id: 3, name: "Cash" },
      ]);
      transactionsApi.listTransactions.mockResolvedValue([
        { ...TRANSACTIONS[0], notes: "", transfer: { counterpart_id: 9, account_id: 2, account_name: "Savings" } },
      ]);
      transactionsApi.updateTransaction.mockResolvedValue({});
      transactionsApi.linkTransfer.mockResolvedValue({ transaction: {}, counterpart: {} });
      renderPage();
      const tbl = await findTable();

      await userEvent.click(tbl.getByRole("button", { name: "Edit" }));
      screen.getAllByRole("button", { name: "Category" }).at(-1).focus();
      await userEvent.keyboard("cash{Tab}");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(transactionsApi.linkTransfer).toHaveBeenCalledWith(1, 3));
      expect(transactionsApi.updateTransaction.mock.calls[0][1]).not.toHaveProperty("category");
    });

    it("picking a category in the edit form sends it, which unlinks the transfer", async () => {
      transactionsApi.listTransactions.mockResolvedValue([
        { ...TRANSACTIONS[0], notes: "", transfer: { counterpart_id: 9, account_id: 2, account_name: "Savings" } },
      ]);
      transactionsApi.updateTransaction.mockResolvedValue({});
      renderPage();
      const tbl = await findTable();

      await userEvent.click(tbl.getByRole("button", { name: "Edit" }));
      const pickers = screen.getAllByRole("button", { name: "Category" });
      pickers.at(-1).focus();
      await userEvent.keyboard("groc{Tab}");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(1, expect.objectContaining({ category: 1 })),
      );
      expect(transactionsApi.linkTransfer).not.toHaveBeenCalled();
    });
  });
});

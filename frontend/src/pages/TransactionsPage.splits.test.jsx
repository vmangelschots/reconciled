import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TransactionsIndex, TransactionsPage } from "./TransactionsPage";
import { AccountsProvider } from "../accounts/AccountsContext";
import { ToastProvider } from "../components/ui/Toast";
import * as accountsApi from "../api/accounts";
import * as categoriesApi from "../api/categories";
import * as transactionsApi from "../api/transactions";

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

// The ledger lives at /transactions/:accountId, inside the accounts context.
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AccountsProvider>
          <Routes>
            <Route path="/transactions" element={<TransactionsIndex />} />
            <Route path="/transactions/:accountId" element={<TransactionsPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </AccountsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

vi.mock("../api/accounts", async () => {
  const actual = await vi.importActual("../api/accounts");
  return { ...actual, listAccounts: vi.fn(), getAccount: vi.fn() };
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
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    linkTransfer: vi.fn(),
    saveSplit: vi.fn(),
    unsplit: vi.fn(),
    getReviewCount: vi.fn(),
  };
});

const ACCOUNTS = [
  { id: 1, name: "Checking" },
  { id: 2, name: "Savings" },
];
const CATEGORIES = [
  { id: 1, name: "Restaurants", parent: null },
  { id: 2, name: "Gifts", parent: null },
  { id: 3, name: "Sports", parent: null },
];

function part(id, amount_cents, fields = {}) {
  return { id, amount_cents, category: null, category_confirmed: true, notes: "", transfer: null, ...fields };
}

function splitDinner(parts) {
  return {
    id: 10,
    date: "2026-03-03",
    payee: "Pizzeria",
    notes: "",
    category: null,
    amount_cents: -6000,
    transfer: null,
    parts: parts ?? [part(11, -3000, { category: 1, notes: "my half" }), part(12, -3000, { category: 2, notes: "Tom" })],
  };
}

const BISTRO = { id: 20, date: "2026-03-04", payee: "Bistro", notes: "", category: 1, amount_cents: -6000, transfer: null, parts: [] };
const TO_SAVINGS = {
  id: 30,
  date: "2026-03-05",
  payee: "To savings",
  notes: "",
  category: null,
  amount_cents: -500,
  transfer: { counterpart_id: 99, account_id: 2, account_name: "Savings", created_by_transfer: false },
  parts: [],
};

function apiError(detail, line = null) {
  return Object.assign(new Error(detail), { status: 400, data: { detail, line } });
}

function renderPage(rows = [splitDinner(), BISTRO, TO_SAVINGS]) {
  transactionsApi.listTransactions.mockResolvedValue(rows);
  renderAt("/transactions/1");
}

async function findTable() {
  return within(await screen.findByRole("table", {}, { timeout: 5000 }));
}

function rowOf(text) {
  return screen.getByText(text).closest("tr");
}

function editor() {
  return screen.queryByRole("form", { name: "Split transaction" });
}

function amount(n) {
  return screen.getByRole("textbox", { name: `Part ${n} amount` });
}

async function openSplitOnBistro() {
  await userEvent.click(within(rowOf("Bistro")).getByRole("button", { name: /Restaurants/ }));
  await userEvent.keyboard("sp{Enter}");
}

beforeEach(() => {
  vi.clearAllMocks();
  accountsApi.listAccounts.mockResolvedValue(ACCOUNTS);
  categoriesApi.listCategories.mockResolvedValue(CATEGORIES);
});

describe("splits in the ledger", () => {
  it("lists a split once, with its parts grouped beneath it and no Delete on them", async () => {
    renderPage();
    const tbl = await findTable();

    expect(tbl.getByRole("button", { name: /Split · 2/ })).toBeInTheDocument();
    const partRow = rowOf("my half");
    expect(within(partRow).queryByText("Pizzeria")).not.toBeInTheDocument();
    expect(within(partRow).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(tbl.getAllByRole("button", { name: "Delete" })).toHaveLength(3);
  });

  it("opens the split editor from a part's Edit", async () => {
    renderPage();
    await findTable();

    await userEvent.click(within(rowOf("Tom")).getByRole("button", { name: "Edit" }));

    expect(editor()).toBeInTheDocument();
  });

  it("fades the parts that don't match a category filter", async () => {
    renderPage();
    await findTable();

    await userEvent.click(screen.getByRole("button", { name: "Filter by category" }));
    await userEvent.keyboard("Rest{Enter}");

    await waitFor(() => expect(rowOf("Tom")).toHaveClass("opacity-60"));
    expect(rowOf("my half")).not.toHaveClass("opacity-60");
  });

  it("recategorizes a part optimistically and puts it back when saving fails", async () => {
    let reject;
    transactionsApi.updateTransaction.mockImplementation(() => new Promise((_, r) => (reject = r)));
    renderPage();
    await findTable();

    await userEvent.click(within(rowOf("Tom")).getByRole("button", { name: /Category of part/ }));
    await userEvent.keyboard("Spo{Enter}");

    expect(within(rowOf("Tom")).getByRole("button", { name: /Category of part/ })).toHaveTextContent("Sports");
    expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(12, { category: 3 });

    reject(apiError("nope"));
    await waitFor(() =>
      expect(within(rowOf("Tom")).getByRole("button", { name: /Category of part/ })).toHaveTextContent("Gifts"),
    );
  });
});

describe("the split editor", () => {
  it("replaces the part rows while open", async () => {
    renderPage();
    await findTable();

    await userEvent.click(screen.getByRole("button", { name: /Split · 2/ }));

    expect(screen.queryByText("my half")).not.toBeInTheDocument();
    expect(amount(1)).toHaveValue("30.00");
    expect(amount(2)).toHaveValue("30.00");
    expect(screen.getByRole("textbox", { name: "Part 1 notes" })).toHaveValue("my half");
  });

  it("splits a dinner with one number: the first line takes the rest", async () => {
    renderPage();
    await findTable();

    await openSplitOnBistro();

    expect(editor()).toBeInTheDocument();
    expect(amount(2)).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("a part needs an amount");
    expect(screen.getByRole("button", { name: "Save split" })).toBeDisabled();

    await userEvent.keyboard("30");

    expect(amount(1)).toHaveValue("30.00");
    expect(screen.getByRole("status")).toHaveTextContent("All assigned ✓");
    expect(screen.getByRole("button", { name: /Part 1 category/ })).toHaveTextContent("Restaurants");
  });

  it("stops following once the first line is edited, and shows what's left or over", async () => {
    renderPage();
    await findTable();
    await openSplitOnBistro();

    await userEvent.clear(amount(1));
    await userEvent.type(amount(1), "20");
    await userEvent.type(amount(2), "30");

    expect(amount(1)).toHaveValue("20");
    expect(screen.getByRole("status")).toHaveTextContent(/10\.00 left to assign/);
    expect(screen.getByRole("button", { name: "Save split" })).toBeDisabled();

    await userEvent.clear(amount(2));
    await userEvent.type(amount(2), "45");
    expect(screen.getByRole("status")).toHaveTextContent(/5\.00 over/);
  });

  it("adds a line when the last amount leaves money unassigned", async () => {
    renderPage();
    await findTable();
    await openSplitOnBistro();

    await userEvent.clear(amount(1));
    await userEvent.type(amount(1), "20");
    await userEvent.type(amount(2), "30");
    await userEvent.tab();

    expect(amount(3)).toHaveValue("");
    expect(amount(3)).toHaveAttribute("placeholder", "10.00");
  });

  it("isn't offered on parts or transfers", async () => {
    renderPage();
    await findTable();

    await userEvent.click(within(rowOf("Tom")).getByRole("button", { name: /Category of part/ }));
    expect(screen.queryByText("Split…")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    await userEvent.click(within(rowOf("To savings")).getByRole("button", { name: /Savings/ }));
    expect(screen.queryByText("Split…")).not.toBeInTheDocument();
  });

  it("closes when another row's edit form opens", async () => {
    renderPage();
    await findTable();
    await userEvent.click(screen.getByRole("button", { name: /Split · 2/ }));

    await userEvent.click(within(rowOf("Bistro")).getByRole("button", { name: "Edit" }));

    expect(editor()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("saves with Enter and replaces the row", async () => {
    transactionsApi.saveSplit.mockResolvedValue({
      ...BISTRO,
      category: null,
      parts: [part(21, -3000, { category: 1 }), part(22, -3000, { notes: "Tom" })],
    });
    renderPage();
    await findTable();
    await openSplitOnBistro();

    await userEvent.keyboard("30");
    await userEvent.type(screen.getByRole("textbox", { name: "Part 2 notes" }), "Tom{Enter}");

    expect(transactionsApi.saveSplit).toHaveBeenCalledWith(20, [
      { amount_cents: -3000, category: 1, transfer_account: null, notes: "" },
      { amount_cents: -3000, category: null, transfer_account: null, notes: "Tom" },
    ]);
    await waitFor(() => expect(editor()).not.toBeInTheDocument());
    expect(within(rowOf("Bistro")).getByRole("button", { name: /Split · 2/ })).toBeInTheDocument();
  });

  it("cancels with Escape and returns focus to the category cell", async () => {
    renderPage();
    await findTable();
    await userEvent.click(screen.getByRole("button", { name: /Split · 2/ }));

    await userEvent.type(amount(2), "5");
    await userEvent.keyboard("{Escape}");

    expect(editor()).not.toBeInTheDocument();
    expect(transactionsApi.saveSplit).not.toHaveBeenCalled();
    expect(screen.getByText("my half")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Split · 2/ })).toHaveFocus());
  });

  it("unsplits to the category every part shares, after a confirmation", async () => {
    const shared = splitDinner([part(11, -3000, { category: 1 }), part(12, -3000, { category: 1, notes: "Tom" })]);
    transactionsApi.unsplit.mockResolvedValue({ ...shared, category: 1, parts: [] });
    renderPage([shared]);
    await findTable();
    await userEvent.click(screen.getByRole("button", { name: /Split · 2/ }));

    await userEvent.click(screen.getByRole("button", { name: "Unsplit" }));
    expect(screen.getByText(/This removes 2 parts/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unsplit" }));

    expect(transactionsApi.unsplit).toHaveBeenCalledWith(10, { category: 1 });
    await waitFor(() => expect(editor()).not.toBeInTheDocument());
  });

  it("unsplits to the last line left, and warns about a created counterpart", async () => {
    const withTransfer = splitDinner([
      part(11, -3000, { category: 1 }),
      part(12, -3000, {
        transfer: { counterpart_id: 98, account_id: 2, account_name: "Savings", created_by_transfer: true },
      }),
    ]);
    transactionsApi.unsplit.mockResolvedValue({ ...withTransfer, category: 1, parts: [] });
    renderPage([withTransfer]);
    await findTable();
    await userEvent.click(screen.getByRole("button", { name: /Split · 2/ }));

    await userEvent.click(screen.getByRole("button", { name: "Remove part 2" }));

    expect(screen.getByText("Also removes the linked Savings transaction.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unsplit to Restaurants" }));
    expect(transactionsApi.unsplit).toHaveBeenCalledWith(10, { category: 1 });
  });

  it("keeps the editor open and marks the line a failed save names", async () => {
    transactionsApi.saveSplit.mockRejectedValue(apiError("Archived accounts can't be used for new transfers.", 1));
    renderPage();
    await findTable();
    await userEvent.click(screen.getByRole("button", { name: /Split · 2/ }));

    await userEvent.click(screen.getByRole("button", { name: "Save split" }));

    expect(await within(editor()).findByText("Archived accounts can't be used for new transfers.")).toBeInTheDocument();
    expect(amount(2)).toHaveClass("ring-critical");
    expect(amount(1)).not.toHaveClass("ring-critical");
  });
});

describe("split transactions in the edit form", () => {
  it("shows the parts read-only, locks the amount and leaves the category out", async () => {
    transactionsApi.updateTransaction.mockResolvedValue({});
    renderPage();
    await findTable();

    await userEvent.click(within(rowOf("Pizzeria")).getByRole("button", { name: "Edit" }));
    // The add form is on the page too; this is the row's edit form.
    const form = within(screen.getByRole("button", { name: "Edit split" }).closest("form"));

    // Both forms reuse the same field ids, so fields are found by role/value.
    expect(form.getByRole("spinbutton")).toBeDisabled();
    expect(form.getByText("Unsplit to change the amount")).toBeInTheDocument();
    expect(form.queryByRole("button", { name: "Category" })).not.toBeInTheDocument();
    expect(form.getByText("Gifts")).toBeInTheDocument();
    const payee = form.getByDisplayValue("Pizzeria");
    await userEvent.clear(payee);
    await userEvent.type(payee, "Pizzeria Napoli");
    await userEvent.click(form.getByRole("button", { name: "Save" }));

    const [id, payload] = transactionsApi.updateTransaction.mock.calls[0];
    expect(id).toBe(10);
    expect(payload).not.toHaveProperty("category");
    expect(payload.payee).toBe("Pizzeria Napoli");
  });

  it("opens the split editor from Edit split", async () => {
    renderPage();
    await findTable();
    await userEvent.click(within(rowOf("Pizzeria")).getByRole("button", { name: "Edit" }));

    await userEvent.click(screen.getByRole("button", { name: "Edit split" }));

    expect(editor()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit split" })).not.toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TransactionsPage } from "./TransactionsPage";
import { AccountsProvider } from "../accounts/AccountsContext";
import { ToastProvider } from "../components/ui/Toast";
import * as accountsApi from "../api/accounts";
import * as categoriesApi from "../api/categories";
import * as transactionsApi from "../api/transactions";
import { formatMoney, formatSignedMoney } from "../lib/money";

// Value adjustments in the ledger and the Set value dialog - see the
// value-adjustments spec.

vi.mock("../api/accounts", async () => {
  const actual = await vi.importActual("../api/accounts");
  return { ...actual, listAccounts: vi.fn(), getAccount: vi.fn(), setAccountValue: vi.fn() };
});

vi.mock("../api/categories", async () => {
  const actual = await vi.importActual("../api/categories");
  return { ...actual, listCategories: vi.fn(), createCategory: vi.fn() };
});

vi.mock("../api/transactions", async () => {
  const actual = await vi.importActual("../api/transactions");
  return { ...actual, listTransactions: vi.fn(), deleteTransaction: vi.fn(), getReviewCount: vi.fn() };
});

const HOUSE = { id: 3, name: "House", account_type: "property", tier: "property", current_balance_cents: 31000000 };
const MORTGAGE = { id: 4, name: "Mortgage", account_type: "loan", tier: "loans", current_balance_cents: -18800000 };
const CHECKING = { id: 1, name: "Revolut", account_type: "checking", tier: "everyday", current_balance_cents: 120000 };
const SAVINGS = { id: 2, name: "Spaarrekening", account_type: "savings", tier: "savings", current_balance_cents: 0 };

const ADJUSTMENT = {
  id: 9,
  date: "2026-10-01",
  payee: "Value adjustment",
  notes: "",
  category: null,
  transfer: null,
  parts: [],
  amount_cents: 1500000,
  is_adjustment: true,
  adjustment_value_cents: 31000000,
};

function renderLedger(accountId) {
  return render(
    <MemoryRouter initialEntries={[`/transactions/${accountId}`]}>
      <ToastProvider>
        <AccountsProvider>
          <Routes>
            <Route path="/transactions/:accountId" element={<TransactionsPage />} />
          </Routes>
        </AccountsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

async function findTable() {
  return within(await screen.findByRole("table", {}, { timeout: 5000 }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 24, 12));
  accountsApi.listAccounts.mockResolvedValue([CHECKING, SAVINGS, HOUSE, MORTGAGE]);
  categoriesApi.listCategories.mockResolvedValue([]);
  transactionsApi.listTransactions.mockResolvedValue([ADJUSTMENT]);
});

describe("Value adjustments in the ledger", () => {
  it("shows the value set, no category control and a neutral amount", async () => {
    renderLedger(HOUSE.id);
    const table = await findTable();

    const row = (await table.findByText("Value adjustment")).closest("tr");
    expect(row).toHaveTextContent("Set to €310,000");
    expect(within(row).queryByRole("combobox")).toBeNull();
    expect(within(row).getByText("—")).toBeInTheDocument();
    const amount = within(row).getByText(formatSignedMoney(1500000));
    expect(amount).toHaveClass("text-ink-secondary");
    expect(amount).not.toHaveClass("text-positive");
    expect(within(row).getAllByRole("button").map((b) => b.textContent)).toEqual(["Delete"]);
  });

  it("deletes an adjustment and refreshes the balances", async () => {
    transactionsApi.deleteTransaction.mockResolvedValue({});
    renderLedger(HOUSE.id);
    const table = await findTable();
    const row = (await table.findByText("Value adjustment")).closest("tr");
    const accountLoads = accountsApi.listAccounts.mock.calls.length;

    transactionsApi.listTransactions.mockResolvedValue([]);
    await userEvent.click(within(row).getByRole("button", { name: "Delete" }));

    expect(transactionsApi.deleteTransaction).toHaveBeenCalledWith(9);
    await waitFor(() => expect(screen.queryByText("Value adjustment")).toBeNull());
    expect(accountsApi.listAccounts.mock.calls.length).toBeGreaterThan(accountLoads);
  });
});

describe("Set value", () => {
  it("sets the house's value, previewing the adjustment", async () => {
    accountsApi.setAccountValue.mockResolvedValue({});
    renderLedger(HOUSE.id);
    await findTable();

    await userEvent.click(screen.getByRole("button", { name: "Set value" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(`Current balance ${formatMoney(31000000)}`);
    expect(within(dialog).getByLabelText("Date")).toHaveValue("2026-10-24");
    const value = within(dialog).getByLabelText("Value");
    expect(value).toHaveValue(310000);

    await userEvent.clear(value);
    await userEvent.type(value, "325000");
    expect(dialog).toHaveTextContent(`Adjustment: ${formatSignedMoney(1500000)}`);

    const loads = transactionsApi.listTransactions.mock.calls.length;
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(accountsApi.setAccountValue).toHaveBeenCalledWith(HOUSE.id, { date: "2026-10-24", value_cents: 32500000 });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(transactionsApi.listTransactions.mock.calls.length).toBeGreaterThan(loads);
  });

  it("leaves the difference to the server on another date", async () => {
    renderLedger(HOUSE.id);
    await findTable();
    await userEvent.click(screen.getByRole("button", { name: "Set value" }));
    const dialog = await screen.findByRole("dialog");

    const date = within(dialog).getByLabelText("Date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-09-30");
    expect(dialog).toHaveTextContent("Difference worked out on save");
  });

  it("updates the mortgage from what is still owed", async () => {
    accountsApi.setAccountValue.mockResolvedValue({});
    transactionsApi.listTransactions.mockResolvedValue([]);
    renderLedger(MORTGAGE.id);
    await findTable();

    await userEvent.click(screen.getByRole("button", { name: "Set value" }));
    const dialog = await screen.findByRole("dialog");
    const owed = within(dialog).getByLabelText("Still owed");
    expect(owed).toHaveValue(188000);
    expect(dialog).toHaveTextContent("Book the monthly payment as an expense");

    await userEvent.clear(owed);
    await userEvent.type(owed, "187340");
    expect(dialog).toHaveTextContent(`Adjustment: ${formatSignedMoney(66000)}`);
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(accountsApi.setAccountValue).toHaveBeenCalledWith(MORTGAGE.id, {
      date: "2026-10-24",
      value_cents: -18734000,
    });
  });

  it("is not offered on everyday or savings accounts", async () => {
    transactionsApi.listTransactions.mockResolvedValue([]);
    const { unmount } = renderLedger(CHECKING.id);
    await findTable();
    expect(screen.queryByRole("button", { name: "Set value" })).toBeNull();
    unmount();

    renderLedger(SAVINGS.id);
    await findTable();
    expect(screen.queryByRole("button", { name: "Set value" })).toBeNull();
  });
});

// A loan that follows its schedule - see the loan-schedules spec and the
// value-adjustments spec's scheduled adjustments.
describe("A loan with a schedule", () => {
  const SCHEDULED = { ...MORTGAGE, has_loan: true, loan_paid_from: CHECKING.id };
  const INSTALLMENT = {
    ...ADJUSTMENT,
    id: 21,
    date: "2026-11-04",
    amount_cents: 45097,
    adjustment_value_cents: -18734000,
    loan_installment: 24,
    loan_term_months: 300,
  };
  const LINE_UP = { ...ADJUSTMENT, id: 20, date: "2026-10-20", loan_installment: 0, loan_term_months: 300 };
  const PAYMENT = {
    id: 30,
    date: "2026-11-04",
    payee: "BNP HYPOTHEEK",
    notes: "",
    category: null,
    transfer: null,
    parts: [],
    amount_cents: -94422,
    is_adjustment: false,
    loan_match: { loan_account_id: MORTGAGE.id, loan_account_name: "Mortgage", installment: 24 },
  };

  beforeEach(() => {
    accountsApi.listAccounts.mockResolvedValue([CHECKING, SAVINGS, HOUSE, SCHEDULED]);
  });

  it("offers Schedule instead of Set value", async () => {
    transactionsApi.listTransactions.mockResolvedValue([]);
    renderLedger(MORTGAGE.id);
    await findTable();
    expect(screen.getByRole("link", { name: "Schedule" })).toHaveAttribute("href", "/transactions/4/schedule");
    expect(screen.queryByRole("button", { name: "Set value" })).toBeNull();
  });

  it("offers Set value and Set up schedule on a loan without one", async () => {
    accountsApi.listAccounts.mockResolvedValue([CHECKING, SAVINGS, HOUSE, MORTGAGE]);
    transactionsApi.listTransactions.mockResolvedValue([]);
    renderLedger(MORTGAGE.id);
    await findTable();
    expect(screen.getByRole("button", { name: "Set value" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Set up schedule" })).toBeInTheDocument();
  });

  it("names a scheduled adjustment's installment and offers no Delete", async () => {
    transactionsApi.listTransactions.mockResolvedValue([INSTALLMENT, LINE_UP]);
    renderLedger(MORTGAGE.id);
    const table = await findTable();
    const installment = (await table.findByRole("link", { name: "Installment 24 of 300" })).closest("tr");
    expect(installment).toHaveTextContent("Set to -€187,340");
    expect(within(installment).getByRole("link", { name: "Installment 24 of 300" })).toHaveAttribute(
      "href",
      "/transactions/4/schedule?installment=24",
    );
    expect(within(installment).queryByRole("button", { name: "Delete" })).toBeNull();
    const lineUp = table.getByRole("link", { name: "Schedule start" }).closest("tr");
    expect(within(lineUp).queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("keeps Delete on an ordinary adjustment", async () => {
    transactionsApi.listTransactions.mockResolvedValue([ADJUSTMENT]);
    renderLedger(HOUSE.id);
    const table = await findTable();
    const row = (await table.findByText("Value adjustment")).closest("tr");
    expect(within(row).getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("tags the matched payment with its loan and installment", async () => {
    transactionsApi.listTransactions.mockResolvedValue([PAYMENT]);
    renderLedger(CHECKING.id);
    const table = await findTable();
    const tag = await table.findByRole("link", { name: "Mortgage · installment 24" });
    expect(tag).toHaveAttribute("href", "/transactions/4/schedule?installment=24");
  });

  it("doesn't offer the scheduled loan as a transfer target from its payer", async () => {
    transactionsApi.listTransactions.mockResolvedValue([{ ...PAYMENT, loan_match: null }]);
    renderLedger(CHECKING.id);
    const table = await findTable();
    const row = (await table.findByText("BNP HYPOTHEEK")).closest("tr");
    await userEvent.click(within(row).getAllByRole("button")[0]);
    expect(await screen.findByText("→ Spaarrekening")).toBeInTheDocument();
    expect(screen.queryByText("→ Mortgage")).toBeNull();
  });
});

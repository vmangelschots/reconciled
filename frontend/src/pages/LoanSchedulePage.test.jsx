import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LoanSchedulePage } from "./LoanSchedulePage";
import { AccountsProvider } from "../accounts/AccountsContext";
import { ToastProvider } from "../components/ui/Toast";
import * as accountsApi from "../api/accounts";
import * as categoriesApi from "../api/categories";
import * as loansApi from "../api/loans";
import { formatShortDate } from "../lib/dates";
import { formatMoney } from "../lib/money";

// The loan schedule page - see the loan-schedules spec.

vi.mock("../api/accounts", async () => {
  const actual = await vi.importActual("../api/accounts");
  return { ...actual, listAccounts: vi.fn(), getAccount: vi.fn() };
});

vi.mock("../api/categories", async () => {
  const actual = await vi.importActual("../api/categories");
  return { ...actual, listCategories: vi.fn() };
});

vi.mock("../api/loans", () => ({
  getLoan: vi.fn(),
  saveLoan: vi.fn(),
  removeLoan: vi.fn(),
  previewLoan: vi.fn(),
  listPaymentCandidates: vi.fn(),
  linkPayment: vi.fn(),
  unlinkPayment: vi.fn(),
}));

const CRELAN = { id: 1, name: "Crelan", account_type: "checking", tier: "everyday", current_balance_cents: 500000 };
const SAVINGS = { id: 2, name: "Savings", account_type: "savings", tier: "savings", current_balance_cents: 0 };
const MORTGAGE = {
  id: 4,
  name: "Mortgage",
  account_type: "loan",
  tier: "loans",
  has_loan: true,
  loan_paid_from: 1,
  current_balance_cents: -19954903,
};
const HOUSING = { id: 7, name: "Mortgage", parent: null, is_tab: false };

function isoMonth(first, offset) {
  const date = new Date(Date.UTC(first[0], first[1] - 1 + offset, first[2]));
  return date.toISOString().slice(0, 10);
}

// A 300-month schedule from 2 Dec 2024 with the given states (the rest
// upcoming), and payments for posted installments.
function makeLoan({ states = {}, payments = {}, setup = "2026-10-20" } = {}) {
  const installments = Array.from({ length: 300 }, (_, i) => {
    const number = i + 1;
    return {
      number,
      date: isoMonth([2024, 12, 2], i),
      payment_cents: number === 300 ? 94306 : 94422,
      interest_cents: 49325,
      principal_cents: 45097,
      balance_after_cents: 20000000 - number * 45097,
      state: states[number] ?? (number < 23 ? "before_setup" : "upcoming"),
      payment: payments[number] ?? null,
    };
  });
  return {
    account: 4,
    principal_cents: 20000000,
    annual_rate: "3.0000",
    term_months: 300,
    first_payment_date: "2024-12-02",
    paid_from: 1,
    paid_from_name: "Crelan",
    payment_category: 7,
    setup_date: setup,
    payment_cents: 94422,
    end_date: "2049-11-02",
    current_balance_cents: -19954903,
    installments,
  };
}

const PREVIEW = {
  payment_cents: 94422,
  last_payment_cents: 94306,
  end_date: "2049-11-02",
  next_installment: { number: 25, date: "2026-12-02" },
  schedule_balance_today_cents: -18900000,
  current_balance_cents: 0,
  found_payments: [
    { id: 11, date: "2026-11-02", payee: "BNP", amount_cents: -94422 },
    { id: 12, date: "2026-10-02", payee: "BNP", amount_cents: -94422 },
    { id: 13, date: "2026-09-02", payee: "BNP", amount_cents: -94422 },
  ],
  repost: null,
};

function renderPage(path = "/transactions/4/schedule") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AccountsProvider>
          <Routes>
            <Route path="/transactions/:accountId/schedule" element={<LoanSchedulePage />} />
          </Routes>
        </AccountsProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function notFound() {
  return Object.assign(new Error("This loan isn't set up."), { status: 404 });
}

function row(number) {
  return document.querySelector(`[data-installment="${number}"]`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 12, 12));
  accountsApi.listAccounts.mockResolvedValue([CRELAN, SAVINGS, MORTGAGE]);
  accountsApi.getAccount.mockResolvedValue(MORTGAGE);
  categoriesApi.listCategories.mockResolvedValue([HOUSING]);
  loansApi.previewLoan.mockResolvedValue(PREVIEW);
});

async function fillTerms(user) {
  await user.type(screen.getByLabelText("Amount borrowed"), "200000");
  await user.type(screen.getByLabelText("Annual rate"), "3");
  await user.type(screen.getByLabelText("Term in months"), "300");
  await user.type(screen.getByLabelText("First installment (from the repayment table)"), "2024-12-02");
}

describe("Setting up a loan", () => {
  beforeEach(() => {
    accountsApi.getAccount.mockResolvedValue({ ...MORTGAGE, has_loan: false, current_balance_cents: 0 });
    loansApi.getLoan.mockRejectedValue(notFound());
  });

  it("offers to set up a loan without a setup", async () => {
    renderPage();
    expect(await screen.findByText("No repayment schedule yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up schedule" })).toBeInTheDocument();
  });

  it("checks terms that match the bank before saving, then saves them", async () => {
    const user = userEvent.setup();
    loansApi.saveLoan.mockResolvedValue(makeLoan());
    renderPage();
    await screen.findByText("No repayment schedule yet");
    // The only everyday account is picked as the payer.
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Paid from" })).toHaveTextContent("Crelan"));

    await fillTerms(user);
    expect(screen.getByText("300 months (25 years)")).toBeInTheDocument();
    const check = await screen.findByTestId("terms-check");
    expect(check).toHaveTextContent(`${formatMoney(94422)} a month`);
    expect(check).toHaveTextContent(`Next: installment 25 on ${formatShortDate("2026-12-02")}`);
    expect(check).toHaveTextContent(
      `Found in Crelan: ${["2026-11-02", "2026-10-02", "2026-09-02"].map((iso) => formatShortDate(iso)).join(", ")}`,
    );
    expect(loansApi.previewLoan).toHaveBeenLastCalledWith(4, {
      principal_cents: 20000000,
      annual_rate: "3",
      term_months: 300,
      first_payment_date: "2024-12-02",
      paid_from: 1,
      payment_category: null,
    });
    expect(loansApi.saveLoan).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Set up schedule" }));
    await waitFor(() => expect(loansApi.saveLoan).toHaveBeenCalledWith(4, expect.objectContaining({ term_months: 300 })));
    expect(await screen.findByText("Repayment schedule")).toBeInTheDocument();
  });

  it("warns about terms that don't match, and still allows saving", async () => {
    const user = userEvent.setup();
    loansApi.previewLoan.mockResolvedValue({ ...PREVIEW, found_payments: [] });
    renderPage();
    await screen.findByText("No repayment schedule yet");
    await fillTerms(user);
    const check = await screen.findByTestId("terms-check");
    await waitFor(() =>
      expect(check).toHaveTextContent(`No payment of ${formatMoney(94422)} in Crelan in the last 90 days`),
    );
    expect(screen.getByRole("button", { name: "Set up schedule" })).toBeEnabled();
  });
});

describe("A loan with a setup", () => {
  beforeEach(() => {
    loansApi.getLoan.mockResolvedValue(
      makeLoan({
        states: { 23: "posted", 24: "due" },
        payments: { 23: { id: 50, date: "2026-11-04", account_name: "Crelan", linked_by_hand: false } },
      }),
    );
  });

  it("shows what is still owed and the terms", async () => {
    renderPage();
    expect(await screen.findByText("still owed")).toHaveTextContent("€199,549 still owed");
    expect(
      screen.getByText(`€200,000 at 3.00% over 25 years · ${formatMoney(94422)} a month from Crelan · ends Nov 2049`),
    ).toBeInTheDocument();
  });

  it("edits the terms, warning about what saving reposts", async () => {
    const user = userEvent.setup();
    loansApi.previewLoan.mockResolvedValue({ ...PREVIEW, repost: { installments: 2, no_longer_matching: 2 } });
    loansApi.saveLoan.mockResolvedValue(makeLoan());
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const rate = screen.getByLabelText("Annual rate");
    expect(rate).toHaveValue(3);
    await user.clear(rate);
    await user.type(rate, "2.9");
    expect(await screen.findByText(/Saving reposts 2 installments; 2 payments will no longer match/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(loansApi.saveLoan).toHaveBeenCalledWith(4, expect.objectContaining({ annual_rate: "2.9", payment_category: 7 })),
    );
  });

  it("says nothing about reposting when only the category changes", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await screen.findByTestId("terms-check");
    expect(screen.queryByText(/Saving reposts/)).toBeNull();
  });

  it("removes the setup after confirming", async () => {
    const user = userEvent.setup();
    loansApi.removeLoan.mockResolvedValue(null);
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Remove schedule" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("The posted adjustments stay as ordinary value adjustments");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(loansApi.removeLoan).toHaveBeenCalledWith(4));
    expect(await screen.findByText("No repayment schedule yet")).toBeInTheDocument();
  });
});

describe("The schedule table", () => {
  it("shows posted, due and later installments, with setup collapsed behind a divider", async () => {
    loansApi.getLoan.mockResolvedValue(
      makeLoan({
        states: { 23: "posted", 24: "due" },
        payments: { 23: { id: 50, date: "2026-11-04", account_name: "Crelan", linked_by_hand: false } },
      }),
    );
    renderPage();
    await screen.findByText("Repayment schedule");
    expect(row(23)).toHaveTextContent(`Posted ${formatShortDate("2026-11-04")}`);
    expect(within(row(23)).queryByRole("button", { name: "Unlink" })).toBeNull();
    expect(row(24)).toHaveTextContent("Due");
    expect(row(24)).toHaveClass("bg-surface-2");
    expect(row(25)).not.toHaveTextContent(/Posted|Due|Missed/);
    expect(screen.getByRole("separator")).toHaveTextContent(`Set up ${formatShortDate("2026-10-20")}`);
    // Installments before setup stay behind "Show earlier".
    expect(row(22)).toBeNull();
  });

  it("opens a long loan on what matters now", async () => {
    loansApi.getLoan.mockResolvedValue(
      makeLoan({
        setup: "2026-07-20",
        states: Object.fromEntries([
          ...Array.from({ length: 19 }, (_, i) => [i + 1, "before_setup"]),
          ...[20, 21, 22, 23].map((n) => [n, "posted"]),
          [24, "due"],
        ]),
        payments: Object.fromEntries(
          [20, 21, 22, 23].map((n) => [n, { id: n, date: "2026-10-02", account_name: "Crelan", linked_by_hand: false }]),
        ),
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Repayment schedule");
    const shown = [...document.querySelectorAll("[data-installment]")].map((li) => Number(li.dataset.installment));
    expect(shown).toEqual(Array.from({ length: 15 }, (_, i) => i + 22));
    expect(screen.getByRole("button", { name: "Show earlier (21 installments)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all (264 more, to Nov 2049)" }));
    expect(row(300)).toHaveTextContent(`last payment ${formatMoney(94306)}`);
  });

  it("marks a missed installment and links its payment by hand", async () => {
    const user = userEvent.setup();
    loansApi.getLoan.mockResolvedValue(makeLoan({ states: { 23: "missed", 24: "due" } }));
    loansApi.listPaymentCandidates.mockResolvedValue([
      { id: 77, date: "2026-11-09", payee: "BNP HYPOTHEEK", amount_cents: -94422, account_id: 1, account_name: "Crelan" },
    ]);
    loansApi.linkPayment.mockResolvedValue(
      makeLoan({
        states: { 23: "posted", 24: "due" },
        payments: { 23: { id: 77, date: "2026-11-09", account_name: "Crelan", linked_by_hand: true } },
      }),
    );
    loansApi.unlinkPayment.mockResolvedValue(makeLoan({ states: { 23: "missed", 24: "due" } }));
    renderPage();
    await screen.findByText("Repayment schedule");
    const missed = within(row(23)).getByText("Missed");
    expect(missed.closest(".text-warning")).not.toBeNull();

    await user.click(within(row(23)).getByRole("button", { name: "Link payment" }));
    await user.click(await within(row(23)).findByRole("button", { name: /BNP HYPOTHEEK/ }));
    await waitFor(() => expect(loansApi.linkPayment).toHaveBeenCalledWith(4, 23, 77));
    expect(await within(row(23)).findByText(`Posted ${formatShortDate("2026-11-09")}`)).toBeInTheDocument();

    await user.click(within(row(23)).getByRole("button", { name: "Unlink" }));
    await waitFor(() => expect(loansApi.unlinkPayment).toHaveBeenCalledWith(4, 23));
    expect(await within(row(23)).findByText("Missed")).toBeInTheDocument();
  });

  it("says a non-loan account has no schedule", async () => {
    accountsApi.getAccount.mockResolvedValue(CRELAN);
    renderPage("/transactions/1/schedule");
    expect(await screen.findByText("Only a loan account has a repayment schedule.")).toBeInTheDocument();
    expect(loansApi.getLoan).not.toHaveBeenCalled();
  });
});

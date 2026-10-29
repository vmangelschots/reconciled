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
  previewCorrection: vi.fn(),
  addCorrection: vi.fn(),
  previewCorrectionRemoval: vi.fn(),
  removeCorrection: vi.fn(),
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

// A schedule corrected to 170,000.00 on 12 November 2026: 944.22 up to
// installment 24, 849.91 from installment 25 (2 December 2026).
const CORRECTION = {
  id: 9,
  date: "2026-11-12",
  balance_cents: 17000000,
  chosen_payment_cents: null,
  payment_before_cents: 94422,
  payment_after_cents: 84991,
};

function correctedLoan(extra = {}) {
  const loan = makeLoan({
    states: { 23: "posted", 24: "covered", 25: "due" },
    payments: { 23: { id: 50, date: "2026-11-04", account_name: "Crelan", linked_by_hand: false } },
  });
  loan.installments = loan.installments.map((i) =>
    i.number >= 25 ? { ...i, payment_cents: 84991, correction_id: 9 } : { ...i, correction_id: null },
  );
  return { ...loan, payment_cents: 84991, payment_since: "2026-12-02", corrections: [CORRECTION], ...extra };
}

const CORRECTION_PREVIEW = {
  paid_off: false,
  payment_cents: 84991,
  previous_payment_cents: 94422,
  first_installment: { number: 25, date: "2026-12-02" },
  installments_left: 276,
  last_payment_cents: 84839,
  end_date: "2049-11-02",
  schedule_balance_cents: 18886423,
  difference_cents: -1886423,
  found_payments: [{ id: 21, date: "2026-11-02", payee: "BNP", amount_cents: -84991 }],
  near_payment: null,
  repost: { installments: 0, no_longer_matching: 0 },
};

describe("Correcting the balance", () => {
  beforeEach(() => {
    loansApi.getLoan.mockResolvedValue(makeLoan({ states: { 23: "posted", 24: "due" }, payments: { 23: { id: 50, date: "2026-11-04", account_name: "Crelan", linked_by_hand: false } } }));
    loansApi.previewCorrection.mockResolvedValue(CORRECTION_PREVIEW);
  });

  async function openForm(user) {
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Correct balance" }));
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  }

  it("checks a correction before saving, then saves it", async () => {
    const user = userEvent.setup();
    loansApi.addCorrection.mockResolvedValue(correctedLoan());
    await openForm(user);
    expect(screen.getByLabelText("On")).toHaveValue("2026-11-12");
    await user.type(screen.getByLabelText("Owed per the bank"), "170000");

    const check = await screen.findByTestId("correction-check");
    await waitFor(() =>
      expect(loansApi.previewCorrection).toHaveBeenLastCalledWith(4, {
        date: "2026-11-12",
        balance_cents: 17000000,
        payment_cents: null,
      }),
    );
    expect(check).toHaveTextContent(`${formatMoney(84991)}a month from ${formatShortDate("2026-12-02")} · was ${formatMoney(94422)}`);
    expect(check).toHaveTextContent("276 installments left, ends Nov 2049");
    expect(check).toHaveTextContent(`${formatMoney(1886423)} less than the schedule`);
    expect(check).toHaveTextContent(`Found in Crelan: ${formatShortDate("2026-11-02")}`);

    await user.click(screen.getByRole("button", { name: "Save correction" }));
    await waitFor(() => expect(loansApi.addCorrection).toHaveBeenCalledWith(4, expect.objectContaining({ balance_cents: 17000000 })));
    expect(await screen.findByText("Balance corrected.")).toBeInTheDocument();
    expect(screen.queryByTestId("correction-check")).toBeNull();
  });

  it("lets the user pay a different amount", async () => {
    const user = userEvent.setup();
    await openForm(user);
    await user.type(screen.getByLabelText("Owed per the bank"), "170000");
    await user.click(await screen.findByRole("button", { name: "Pay a different amount?" }));
    const payment = screen.getByLabelText("Monthly payment");
    expect(payment).toHaveValue(849.91);
    await user.clear(payment);
    await user.type(payment, "849.90");
    await waitFor(() =>
      expect(loansApi.previewCorrection).toHaveBeenLastCalledWith(4, expect.objectContaining({ payment_cents: 84990 })),
    );
  });

  it("offers the amount the bank paid when it is a cent off", async () => {
    const user = userEvent.setup();
    loansApi.previewCorrection.mockResolvedValue({
      ...CORRECTION_PREVIEW,
      found_payments: [],
      near_payment: { id: 22, date: "2026-10-28", payee: "BNP", amount_cents: -84990 },
    });
    await openForm(user);
    await user.type(screen.getByLabelText("Owed per the bank"), "170000");
    const check = await screen.findByTestId("correction-check");
    await waitFor(() => expect(check).toHaveTextContent(`Crelan paid ${formatMoney(84990)} on ${formatShortDate("2026-10-28")}.`));
    await user.click(screen.getByRole("button", { name: `Use ${formatMoney(84990)}` }));
    await waitFor(() =>
      expect(loansApi.previewCorrection).toHaveBeenLastCalledWith(4, expect.objectContaining({ payment_cents: 84990 })),
    );
  });

  it("says when the loan would be paid off", async () => {
    const user = userEvent.setup();
    loansApi.previewCorrection.mockResolvedValue({ ...CORRECTION_PREVIEW, paid_off: true, payment_cents: null });
    await openForm(user);
    await user.type(screen.getByLabelText("Owed per the bank"), "0");
    expect(await screen.findByText("Paid off. No more installments.")).toBeInTheDocument();
  });
});

describe("A corrected schedule", () => {
  it("says since when the payment applies", async () => {
    loansApi.getLoan.mockResolvedValue(correctedLoan());
    renderPage();
    expect(
      await screen.findByText(
        `€200,000 at 3.00% over 25 years · ${formatMoney(84991)} a month from Crelan since Dec 2026 · ends Nov 2049`,
      ),
    ).toBeInTheDocument();
  });

  it("reads as paid off", async () => {
    loansApi.getLoan.mockResolvedValue(correctedLoan({ paid_off_on: "2026-11-12" }));
    renderPage();
    const date = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    expect(await screen.findByText(`Paid off ${date.format(new Date("2026-11-12T00:00:00Z"))}`)).toBeInTheDocument();
  });

  it("shows the correction as a row between the installments it falls between", async () => {
    loansApi.getLoan.mockResolvedValue(correctedLoan());
    renderPage();
    await screen.findByText("Repayment schedule");
    const correction = document.querySelector('[data-correction="9"]');
    expect(correction).toHaveTextContent("Balance corrected");
    expect(correction).toHaveTextContent(`${formatMoney(94422)} → ${formatMoney(84991)} a month`);
    expect(correction).toHaveTextContent(formatMoney(17000000));
    expect(row(24).nextElementSibling).toBe(correction);
    expect(correction.nextElementSibling).toBe(row(25));
    expect(row(25)).toHaveTextContent(`payment ${formatMoney(84991)}`);
    expect(row(26)).not.toHaveTextContent("payment");
    // A covered installment shows no state.
    expect(row(24)).not.toHaveTextContent(/Missed|Due|Link payment/);
  });

  it("removes a correction after confirming", async () => {
    const user = userEvent.setup();
    loansApi.getLoan.mockResolvedValue(correctedLoan());
    loansApi.previewCorrectionRemoval.mockResolvedValue({
      payment_cents: 94422,
      first_installment: { number: 25, date: "2026-12-02" },
      repost: { installments: 1, no_longer_matching: 1 },
    });
    loansApi.removeCorrection.mockResolvedValue(makeLoan());
    renderPage();
    await screen.findByText("Repayment schedule");
    await user.click(within(document.querySelector('[data-correction="9"]')).getByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        `The schedule goes back to ${formatMoney(94422)} a month from ${formatShortDate("2026-12-02")}. 1 installment will be reposted; 1 payment will no longer match.`,
      ),
    );
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(loansApi.removeCorrection).toHaveBeenCalledWith(4, 9));
    expect(await screen.findByText("Correction removed.")).toBeInTheDocument();
    expect(document.querySelector('[data-correction="9"]')).toBeNull();
  });
});

describe("The missed-payments banner", () => {
  it("names the amount the paying account paid, and opens the form with it", async () => {
    const user = userEvent.setup();
    loansApi.getLoan.mockResolvedValue({
      ...makeLoan({ states: { 23: "missed", 24: "missed", 25: "missed" } }),
      suggestion: { missed_count: 3, amount_cents: 69303 },
    });
    loansApi.previewCorrection.mockResolvedValue(CORRECTION_PREVIEW);
    renderPage();
    const banner = await screen.findByTestId("suggestion");
    expect(banner).toHaveTextContent(
      `The last 3 installments were missed. Crelan paid ${formatMoney(69303)} around each date. Did the bank change the payment?`,
    );
    await user.click(within(banner).getByRole("button", { name: "Correct balance" }));
    await user.type(screen.getByLabelText("Owed per the bank"), "104870.35");
    expect(await screen.findByLabelText("Monthly payment")).toHaveValue(693.03);
  });

  it("suggests a correction without an amount", async () => {
    loansApi.getLoan.mockResolvedValue({
      ...makeLoan({ states: { 23: "missed", 24: "missed" } }),
      suggestion: { missed_count: 2, amount_cents: null },
    });
    renderPage();
    expect(await screen.findByTestId("suggestion")).toHaveTextContent(
      "The last 2 installments were missed. If you repaid extra and the bank changed the payment, correct the balance.",
    );
  });

  it("isn't shown without a suggestion", async () => {
    loansApi.getLoan.mockResolvedValue({ ...makeLoan({ states: { 24: "missed" } }), suggestion: null });
    renderPage();
    await screen.findByText("Repayment schedule");
    expect(screen.queryByTestId("suggestion")).toBeNull();
  });
});

describe("Setting up with the bank's balance", () => {
  beforeEach(() => {
    accountsApi.getAccount.mockResolvedValue({ ...MORTGAGE, has_loan: false, current_balance_cents: 0 });
    loansApi.getLoan.mockRejectedValue(notFound());
  });

  it("checks the payment the bank's balance gives", async () => {
    const user = userEvent.setup();
    loansApi.previewLoan.mockResolvedValue({ ...PREVIEW, payment_cents: 69303, schedule_payment_cents: 73799 });
    renderPage();
    await screen.findByText("No repayment schedule yet");
    await fillTerms(user);
    await user.click(await screen.findByRole("button", { name: "The bank says something else" }));
    await user.type(screen.getByLabelText("Owed per the bank"), "104870.35");
    await waitFor(() =>
      expect(loansApi.previewLoan).toHaveBeenLastCalledWith(
        4,
        expect.objectContaining({ bank_balance_cents: 10487035, bank_balance_date: "2026-11-12" }),
      ),
    );
    expect(screen.getByTestId("terms-check")).toHaveTextContent(
      `${formatMoney(69303)} a month · ${formatMoney(73799)} per the terms`,
    );
  });

  it("is offered when no payment was found", async () => {
    const user = userEvent.setup();
    loansApi.previewLoan.mockResolvedValue({ ...PREVIEW, found_payments: [] });
    renderPage();
    await screen.findByText("No repayment schedule yet");
    await fillTerms(user);
    await user.click(await screen.findByRole("button", { name: "enter what it says you owe" }));
    expect(screen.getByLabelText("Owed per the bank")).toBeInTheDocument();
  });
});

describe("The bank's figure from before an installment", () => {
  it("sends the day of the bank's balance when setting up", async () => {
    const user = userEvent.setup();
    accountsApi.getAccount.mockResolvedValue({ ...MORTGAGE, has_loan: false, current_balance_cents: 0 });
    loansApi.getLoan.mockRejectedValue(notFound());
    loansApi.saveLoan.mockResolvedValue(makeLoan());
    renderPage();
    await screen.findByText("No repayment schedule yet");
    await fillTerms(user);
    await user.click(await screen.findByRole("button", { name: "The bank says something else" }));
    await user.type(screen.getByLabelText("Owed per the bank"), "91786.35");
    const day = screen.getByLabelText("Day of the bank's balance");
    expect(day).toHaveAttribute("min", "2026-10-12");
    await user.clear(day);
    await user.type(day, "2026-11-10");
    await waitFor(() =>
      expect(loansApi.previewLoan).toHaveBeenLastCalledWith(
        4,
        expect.objectContaining({ bank_balance_cents: 9178635, bank_balance_date: "2026-11-10" }),
      ),
    );
    await user.click(screen.getByRole("button", { name: "Set up schedule" }));
    await waitFor(() =>
      expect(loansApi.saveLoan).toHaveBeenCalledWith(4, expect.objectContaining({ bank_balance_date: "2026-11-10" })),
    );
  });

  it("lets a correction go back a month before the setup day", async () => {
    const user = userEvent.setup();
    loansApi.getLoan.mockResolvedValue(makeLoan({ states: { 24: "due" }, setup: "2026-10-29" }));
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Correct balance" }));
    expect(screen.getByLabelText("On")).toHaveAttribute("min", "2026-09-29");
  });
});


import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PortfolioImportDialog } from "./PortfolioImportDialog";
import { ToastProvider } from "./ui/Toast";
import * as accountsApi from "../api/accounts";
import { formatMoney, formatSignedMoney } from "../lib/money";
import { formatDayMonth } from "../lib/yearlyBudgets";

// The preview and saving - see the portfolio-value-import spec.

vi.mock("../api/accounts", async () => {
  const actual = await vi.importActual("../api/accounts");
  return { ...actual, previewPortfolio: vi.fn(), importPortfolio: vi.fn() };
});

const ACCOUNT = { id: 7, name: "Portfolio", account_type: "investment" };
const NEWEST = formatDayMonth("2026-11-01");
const FILE = new File(["<client/>"], "portfolio.xml", { type: "text/xml" });

const PREVIEW = {
  holdings_cents: 2000000,
  holdings_count: 2,
  oldest_price_date: "2026-10-29",
  newest_price_date: "2026-11-01",
  value_date: "2026-11-01",
  cash: [
    { id: "cash-1", name: "Broker", balance_cents: 4075, included: true },
    { id: "cash-2", name: "Savings", balance_cents: 500000, included: true },
  ],
  current_balance_cents: 1800000,
  has_later_value: false,
};

function renderDialog({ onSaved = vi.fn(), onOpenChange = vi.fn() } = {}) {
  render(
    <ToastProvider>
      <PortfolioImportDialog account={ACCOUNT} open onOpenChange={onOpenChange} onSaved={onSaved} />
    </ToastProvider>,
  );
  return { onSaved, onOpenChange };
}

async function upload(user) {
  await user.upload(screen.getByLabelText("File"), FILE);
}

beforeEach(() => {
  vi.resetAllMocks();
  accountsApi.previewPortfolio.mockResolvedValue(PREVIEW);
  accountsApi.importPortfolio.mockResolvedValue({});
});

describe("Preview before saving", () => {
  it("shows the figures once a file is read", async () => {
    const user = userEvent.setup();
    renderDialog();
    expect(screen.getByRole("button", { name: "Save value" })).toBeDisabled();
    await upload(user);

    expect(accountsApi.previewPortfolio).toHaveBeenCalledWith(7, FILE);
    expect(await screen.findByText("Holdings (2)")).toBeInTheDocument();
    expect(screen.getByText(`Prices from ${formatDayMonth("2026-10-29")} to ${NEWEST}`)).toBeInTheDocument();
    expect(screen.getByText(`Value on ${NEWEST}`)).toBeInTheDocument();
    expect(screen.getByText(formatMoney(2504075))).toBeInTheDocument();
    expect(screen.getByText(formatMoney(1800000))).toBeInTheDocument();
    expect(screen.getByText(formatSignedMoney(704075))).toBeInTheDocument();
  });

  it("drops an unticked cash account from the value", async () => {
    const user = userEvent.setup();
    renderDialog();
    await upload(user);

    await user.click(await screen.findByRole("checkbox", { name: /Savings/ }));
    expect(screen.getByText(formatMoney(2004075))).toBeInTheDocument();
  });

  it("starts with a remembered cash account unticked", async () => {
    accountsApi.previewPortfolio.mockResolvedValue({
      ...PREVIEW,
      cash: [PREVIEW.cash[0], { ...PREVIEW.cash[1], included: false }],
    });
    const user = userEvent.setup();
    renderDialog();
    await upload(user);

    expect(await screen.findByRole("checkbox", { name: /Savings/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Broker/ })).toBeChecked();
    expect(screen.getByText(formatMoney(2004075))).toBeInTheDocument();
  });

  it("says when a later value keeps the balance", async () => {
    accountsApi.previewPortfolio.mockResolvedValue({ ...PREVIEW, has_later_value: true });
    const user = userEvent.setup();
    renderDialog();
    await upload(user);

    expect(await screen.findByText(new RegExp(`value set after ${NEWEST}, so its balance stays`))).toBeInTheDocument();
    expect(screen.queryByText("Adjustment")).not.toBeInTheDocument();
  });

  it("shows a refused file and lets the user pick another", async () => {
    accountsApi.previewPortfolio.mockRejectedValueOnce(new Error("In Portfolio Performance, save the file as XML first."));
    const user = userEvent.setup();
    renderDialog();
    await upload(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("save the file as XML");
    expect(screen.getByRole("button", { name: "Save value" })).toBeDisabled();

    await upload(user);
    expect(await screen.findByText("Holdings (2)")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("saves nothing when closed", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await upload(user);
    await screen.findByText("Holdings (2)");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(accountsApi.importPortfolio).not.toHaveBeenCalled();
  });
});

describe("Saving", () => {
  it("sends the date, the value and what was left out", async () => {
    const user = userEvent.setup();
    const { onSaved, onOpenChange } = renderDialog();
    await upload(user);

    await user.click(await screen.findByRole("checkbox", { name: /Savings/ }));
    await user.click(screen.getByRole("button", { name: "Save value" }));

    await waitFor(() =>
      expect(accountsApi.importPortfolio).toHaveBeenCalledWith(7, {
        date: "2026-11-01",
        value_cents: 2004075,
        excluded_cash_ids: ["cash-2"],
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

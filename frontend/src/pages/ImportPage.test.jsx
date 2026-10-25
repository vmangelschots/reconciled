import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportPage } from "./ImportPage";
import { AccountsProvider } from "../accounts/AccountsContext";
import { ToastProvider } from "../components/ui/Toast";
import * as accountsApi from "../api/accounts";
import * as importsApi from "../api/imports";
import * as transactionsApi from "../api/transactions";
import { ReviewCountProvider } from "../review/ReviewCountContext";

vi.mock("../api/accounts", () => ({ listAccounts: vi.fn() }));
vi.mock("../api/imports", () => ({
  uploadImportFile: vi.fn(),
  mapCsvColumns: vi.fn(),
  assignProducts: vi.fn(),
  commitImport: vi.fn(),
}));
vi.mock("../api/transactions", () => ({ getReviewCount: vi.fn().mockResolvedValue({ count: 0 }) }));

// An OFX upload parses straight away, so the preview shows without mapping.
const SESSION = {
  id: 7,
  file_format: "ofx",
  candidates: [
    {
      index: 0,
      date: "2026-03-04",
      amount_cents: 50000,
      description: "OVERSCHRIJVING BE12",
      payee: "OVERSCHRIJVING BE12",
      is_duplicate: false,
      transfer_match: { transaction_id: 42, counterpart_account_name: "Checking" },
    },
    {
      index: 1,
      date: "2026-03-04",
      amount_cents: -1200,
      description: "Shop",
      payee: "Shop",
      is_duplicate: true,
      transfer_match: null,
    },
  ],
};

async function uploadAndPreview() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <ReviewCountProvider>
          <ImportPage />
        </ReviewCountProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
  // Wait for the form itself: listAccounts may already have been called by
  // an earlier render in the same test.
  await userEvent.upload(
    await screen.findByLabelText("File (.csv or .ofx)"),
    new File(["<OFX>"], "savings.ofx", { type: "application/x-ofx" }),
  );
  // jsdom's constraint validation doesn't see files attached by
  // userEvent.upload on a required input, so submit the form directly.
  fireEvent.submit(screen.getByRole("button", { name: /upload/i }).closest("form"));
  return within(await screen.findByRole("table"));
}

beforeEach(() => {
  vi.clearAllMocks();
  accountsApi.listAccounts.mockResolvedValue([{ id: 2, name: "Savings" }]);
  importsApi.uploadImportFile.mockResolvedValue(SESSION);
});

describe("ImportPage transfer matches", () => {
  it("labels a line that matches a created transfer counterpart and selects it by default", async () => {
    const tbl = await uploadAndPreview();

    const matchRow = tbl.getByText("Matches transfer from Checking").closest("tr");
    expect(within(matchRow).getByRole("checkbox")).toBeChecked();
    const duplicateRow = tbl.getByText("Likely duplicate").closest("tr");
    expect(within(duplicateRow).getByRole("checkbox")).not.toBeChecked();
  });

  it("reports confirmed transfers after committing", async () => {
    importsApi.commitImport.mockResolvedValue({ created_count: 0, confirmed_transfer_count: 1 });
    await uploadAndPreview();

    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    expect(importsApi.commitImport).toHaveBeenCalledWith(7, [0]);
    expect((await screen.findAllByText("Created 0 transactions. Confirmed 1 transfer.")).length).toBeGreaterThan(0);
  });
});

describe("ImportPage review line", () => {
  it("says how many were categorized and links to the Review page", async () => {
    importsApi.commitImport.mockResolvedValue({ created_count: 20, confirmed_transfer_count: 0, categorized_count: 14 });
    await uploadAndPreview();

    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    expect(
      (await screen.findAllByText("Created 20 transactions. 14 got a category (14 from your history).")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("14 got a category (14 from your history).", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review 14 guesses" })).toHaveAttribute("href", "/review");
    // The nav's Review count is refreshed after the commit, not just on the
    // next navigation.
    await waitFor(() => expect(transactionsApi.getReviewCount).toHaveBeenCalledTimes(2));
  });

  it("shows only the created count when nothing was categorized", async () => {
    importsApi.commitImport.mockResolvedValue({ created_count: 6, confirmed_transfer_count: 0, categorized_count: 0 });
    await uploadAndPreview();

    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    expect((await screen.findAllByText("Created 6 transactions.")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Review/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Import another file" })).toBeInTheDocument();
  });
});

function commitResult(history, ai, aiStatus = "ok", declined = 0) {
  return {
    created_count: 20,
    confirmed_transfer_count: 0,
    categorized_count: history + ai,
    categorized_by_source: { history, ai },
    ai: { status: aiStatus, declined_count: declined },
  };
}

async function commitWith(result) {
  importsApi.commitImport.mockResolvedValue(result);
  await uploadAndPreview();
  await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));
  await screen.findByRole("button", { name: "Import another file" });
}

function cardLines() {
  return screen
    .getByRole("button", { name: "Import another file" })
    .closest("div.flex-col")
    .querySelectorAll("p");
}

describe("ImportPage AI summary", () => {
  it("splits history and AI guesses on one line", async () => {
    await commitWith(commitResult(10, 4));

    expect([...cardLines()].map((p) => p.textContent)).toEqual([
      "Created 20 transactions.",
      "14 got a category (10 from your history, 4 by AI).",
    ]);
    expect(screen.getByRole("link", { name: "Review 14 guesses" })).toBeInTheDocument();
    expect(document.querySelector("li svg.text-success")).not.toBeNull();
  });

  it("leaves out a zero part", async () => {
    await commitWith(commitResult(0, 4));

    expect(screen.getByText("4 got a category (4 by AI).", { selector: "p" })).toBeInTheDocument();
  });

  it("says when AI didn't respond, with an error toast", async () => {
    await commitWith(commitResult(10, 0, "failed"));

    expect(screen.getByText("10 got a category (10 from your history).", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("AI guessing didn't respond.", { selector: "p" })).toBeInTheDocument();
    // The toast uses the error style.
    const toastIcon = document.querySelector("li svg.text-critical");
    expect(toastIcon.closest("li")).toHaveTextContent("AI guessing didn't respond.");
  });

  it("names the key setting when the key was rejected", async () => {
    await commitWith(commitResult(10, 0, "key_rejected"));

    expect(screen.getByText("AI is not working: check OPENAI_API_KEY.", { selector: "p" })).toBeInTheDocument();
  });

  it("counts the payees AI couldn't guess", async () => {
    await commitWith(commitResult(10, 4, "ok", 3));

    expect(screen.getByText("3 new payees couldn't be guessed.", { selector: "p" })).toBeInTheDocument();
  });
});

describe("ImportPage while committing", () => {
  async function startCommit(session) {
    importsApi.uploadImportFile.mockResolvedValue(session);
    let resolve;
    importsApi.commitImport.mockReturnValue(new Promise((res) => (resolve = res)));
    const tbl = await uploadAndPreview();
    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));
    return { tbl, resolve };
  }

  it("shows that it's working and locks the preview", async () => {
    const { tbl, resolve } = await startCommit({ ...SESSION, ai_enabled: false });

    expect(screen.getByRole("button", { name: "Importing…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    for (const checkbox of tbl.getAllByRole("checkbox")) expect(checkbox).toBeDisabled();
    await act(async () => resolve(commitResult(0, 0, "off")));
  });

  it("says it can take up to a minute only after a delay, and only with AI on", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      for (const aiEnabled of [false, true]) {
        const { resolve } = await startCommit({ ...SESSION, ai_enabled: aiEnabled });
        expect(screen.queryByText(/this can take up to a minute/)).toBeNull();

        await act(() => vi.advanceTimersByTimeAsync(4000));

        expect(screen.queryByText("Guessing categories, this can take up to a minute.") !== null).toBe(aiEnabled);
        await act(async () => resolve(commitResult(0, 0)));
        cleanup();
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Import starts on the right account", () => {
  const ACCOUNTS = [
    { id: 1, name: "Revolut", current_balance_cents: 0, archived: false },
    { id: 2, name: "Crelan", current_balance_cents: 0, archived: false },
  ];

  function renderAt(path) {
    render(
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <ReviewCountProvider>
            <AccountsProvider>
              <ImportPage />
            </AccountsProvider>
          </ReviewCountProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    window.localStorage.clear();
    accountsApi.listAccounts.mockResolvedValue(ACCOUNTS);
  });

  it("preselects the account in the address", async () => {
    window.localStorage.setItem("reconciled.lastAccount", "1");
    renderAt("/import?account=2");

    await waitFor(() => expect(screen.getByRole("combobox", { name: /account/i })).toHaveTextContent("Crelan"));
  });

  it("otherwise starts on the last-opened account", async () => {
    window.localStorage.setItem("reconciled.lastAccount", "2");
    renderAt("/import");

    await waitFor(() => expect(screen.getByRole("combobox", { name: /account/i })).toHaveTextContent("Crelan"));
  });

  it("ignores an account that isn't active", async () => {
    renderAt("/import?account=99");

    await waitFor(() => expect(screen.getByRole("combobox", { name: /account/i })).toHaveTextContent("Revolut"));
  });
});

describe("Revolut products", () => {
  const ACCOUNTS = [
    { id: 1, name: "Revolut", archived: false },
    { id: 3, name: "Revolut Pockets", archived: false },
    { id: 4, name: "Old pockets", archived: true },
  ];
  const UPLOADED = {
    id: 9,
    file_format: "csv",
    preset: "revolut",
    preset_label: "Revolut",
    candidates: [],
    products: ["Savings", "Current"],
    product_accounts: { Current: 1 },
  };
  const line = (index, accountId, accountName, amount, description, pocketPair = null) => ({
    index,
    date: "2026-10-22",
    amount_cents: amount,
    description,
    payee: description,
    is_duplicate: false,
    transfer_match: null,
    account_id: accountId,
    account_name: accountName,
    pocket_pair: pocketPair,
  });
  const ASSIGNED = {
    ...UPLOADED,
    candidates: [
      line(0, 3, "Revolut Pockets", -25472, "Luminus SA"),
      line(1, 3, "Revolut Pockets", 35000, "To pocket EUR Electricity", { index: 2, account_name: "Revolut" }),
      line(2, 1, "Revolut", -35000, "To pocket EUR Electricity", { index: 1, account_name: "Revolut Pockets" }),
    ],
  };

  async function uploadRevolut(uploaded = UPLOADED) {
    accountsApi.listAccounts.mockResolvedValue(ACCOUNTS);
    importsApi.uploadImportFile.mockResolvedValue(uploaded);
    render(
      <MemoryRouter>
        <ToastProvider>
          <ReviewCountProvider>
            <ImportPage />
          </ReviewCountProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    await userEvent.upload(
      await screen.findByLabelText("File (.csv or .ofx)"),
      new File(["Type,Product"], "revolut.csv", { type: "text/csv" }),
    );
    fireEvent.submit(screen.getByRole("button", { name: /upload/i }).closest("form"));
    await screen.findByText("Accounts");
  }

  async function choose(product, option) {
    await userEvent.click(screen.getByRole("combobox", { name: product }));
    await userEvent.click(await screen.findByRole("option", { name: option }));
  }

  it("asks where Savings goes, with Current on the upload account", async () => {
    await uploadRevolut();

    expect(screen.getByText(/Recognized as a Revolut export/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Current" })).toHaveTextContent("Revolut");
    expect(screen.getByRole("combobox", { name: "Savings" })).toHaveTextContent("Choose an account");
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("preselects a remembered choice", async () => {
    await uploadRevolut({ ...UPLOADED, product_accounts: { Current: 1, Savings: 3 } });

    expect(screen.getByRole("combobox", { name: "Savings" })).toHaveTextContent("Revolut Pockets");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("offers active accounts and Don't import, and sends the choice", async () => {
    importsApi.assignProducts.mockResolvedValue({ ...ASSIGNED, candidates: ASSIGNED.candidates.slice(2) });
    await uploadRevolut();

    await userEvent.click(screen.getByRole("combobox", { name: "Savings" }));
    expect(screen.queryByRole("option", { name: "Old pockets" })).toBeNull();
    await userEvent.click(screen.getByRole("option", { name: "Don't import" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(importsApi.assignProducts).toHaveBeenCalledWith(9, { Current: 1, Savings: null });
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("previews two accounts with an Account column and pocket moves as transfers", async () => {
    importsApi.assignProducts.mockResolvedValue(ASSIGNED);
    await uploadRevolut();

    await choose("Savings", "Revolut Pockets");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    const tbl = within(await screen.findByRole("table"));
    expect(screen.getByText("Recognized as a Revolut export.")).toBeInTheDocument();
    expect(tbl.getByRole("columnheader", { name: "Account" })).toBeInTheDocument();
    expect(tbl.getByText("← Revolut").closest("tr")).toHaveTextContent("Revolut Pockets");
    expect(tbl.getByText("→ Revolut Pockets").closest("tr")).toBeInTheDocument();
  });
});

describe("Preview on one account", () => {
  it("has no Account column", async () => {
    const tbl = await uploadAndPreview();
    expect(tbl.queryByRole("columnheader", { name: "Account" })).toBeNull();
  });
});

describe("Remembered CSV mapping", () => {
  it("fills the mapping step from the account's last mapping", async () => {
    importsApi.uploadImportFile.mockResolvedValue({
      id: 11,
      file_format: "csv",
      preset: "",
      preset_label: null,
      candidates: [],
      columns: ["Posted Date", "Amount", "Description"],
      saved_mapping: { date: "Posted Date", date_format: "DD/MM/YYYY", amount: "Amount", description: "Description" },
    });
    importsApi.mapCsvColumns.mockResolvedValue(SESSION);
    render(
      <MemoryRouter>
        <ToastProvider>
          <ReviewCountProvider>
            <ImportPage />
          </ReviewCountProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    await userEvent.upload(
      await screen.findByLabelText("File (.csv or .ofx)"),
      new File(["Posted Date"], "joint.csv", { type: "text/csv" }),
    );
    fireEvent.submit(screen.getByRole("button", { name: /upload/i }).closest("form"));

    expect(await screen.findByRole("combobox", { name: "date" })).toHaveTextContent("Posted Date");
    expect(screen.getByRole("combobox", { name: "amount" })).toHaveTextContent("Amount");
    expect(screen.getByRole("combobox", { name: "payee" })).toHaveTextContent("—");
    expect(screen.getByRole("combobox", { name: "Date format" })).toHaveTextContent("DD/MM/YYYY");

    await userEvent.click(screen.getByRole("button", { name: "Parse" }));
    expect(importsApi.mapCsvColumns).toHaveBeenCalledWith(11, {
      date: "Posted Date",
      amount: "Amount",
      description: "Description",
      payee: "",
      date_format: "DD/MM/YYYY",
    });
  });
});

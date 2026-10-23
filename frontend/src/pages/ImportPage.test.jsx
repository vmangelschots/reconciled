import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImportPage } from "./ImportPage";
import { ToastProvider } from "../components/ui/Toast";
import * as accountsApi from "../api/accounts";
import * as importsApi from "../api/imports";

vi.mock("../api/accounts", () => ({ listAccounts: vi.fn() }));
vi.mock("../api/imports", () => ({ uploadImportFile: vi.fn(), mapCsvColumns: vi.fn(), commitImport: vi.fn() }));

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
        <ImportPage />
      </ToastProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(accountsApi.listAccounts).toHaveBeenCalled());
  await userEvent.upload(
    screen.getByLabelText("File (.csv or .ofx)"),
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
    expect((await screen.findAllByText("Created 0 transaction(s). Confirmed 1 transfer(s).")).length).toBeGreaterThan(0);
  });
});

describe("ImportPage review line", () => {
  it("says how many were categorized and links to the Review page", async () => {
    importsApi.commitImport.mockResolvedValue({ created_count: 20, confirmed_transfer_count: 0, categorized_count: 14 });
    await uploadAndPreview();

    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    expect(
      (await screen.findAllByText("Created 20 transaction(s). 14 got a category from your history.")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Review 14 guesses" })).toHaveAttribute("href", "/review");
  });

  it("shows only the created count when nothing was categorized", async () => {
    importsApi.commitImport.mockResolvedValue({ created_count: 6, confirmed_transfer_count: 0, categorized_count: 0 });
    await uploadAndPreview();

    await userEvent.click(screen.getByRole("button", { name: /confirm import/i }));

    expect((await screen.findAllByText("Created 6 transaction(s).")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Review/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Import another file" })).toBeInTheDocument();
  });
});

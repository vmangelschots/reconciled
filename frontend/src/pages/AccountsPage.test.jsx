import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AccountsPage } from "./AccountsPage";
import { ToastProvider } from "../components/ui/Toast";
import * as accountsApi from "../api/accounts";

vi.mock("../api/accounts", async () => {
  const actual = await vi.importActual("../api/accounts");
  return {
    ...actual,
    listAccounts: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    archiveAccount: vi.fn(),
  };
});

const ACCOUNTS = [
  { id: 1, name: "Main Checking", account_type: "checking", current_balance_cents: 10000 },
  { id: 2, name: "Side Savings", account_type: "cash", current_balance_cents: 20000 },
];

function renderPage() {
  return render(
    <ToastProvider>
      <AccountsPage />
    </ToastProvider>,
  );
}

async function findTable() {
  return within(await screen.findByRole("table"));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AccountsPage", () => {
  it("keeps existing rows visible through a background reload (no placeholder reappears)", async () => {
    let resolveSecondLoad;
    accountsApi.listAccounts
      .mockResolvedValueOnce(ACCOUNTS)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondLoad = resolve;
          }),
      );
    accountsApi.updateAccount.mockResolvedValue({});

    renderPage();
    const tbl = await findTable();
    expect(tbl.getByText("Main Checking")).toBeInTheDocument();

    await userEvent.click(tbl.getAllByRole("button", { name: "Edit" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    // The reload triggered by Save is in flight (unresolved) - the table
    // must stay mounted with its existing rows, not collapse to the
    // loading placeholder.
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Side Savings")).toBeInTheDocument();
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();

    resolveSecondLoad(ACCOUNTS);
    await waitFor(() => expect(accountsApi.listAccounts).toHaveBeenCalledTimes(2));
  });

  it("disables a row's buttons immediately on Archive and the row disappears once it resolves", async () => {
    accountsApi.listAccounts.mockResolvedValue(ACCOUNTS);
    let resolveArchive;
    accountsApi.archiveAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveArchive = resolve;
        }),
    );

    renderPage();
    const tbl = await findTable();

    const [archiveChecking] = tbl.getAllByRole("button", { name: "Archive" });
    const [editChecking] = tbl.getAllByRole("button", { name: "Edit" });
    await userEvent.click(archiveChecking);

    expect(archiveChecking).toBeDisabled();
    expect(editChecking).toBeDisabled();

    resolveArchive({});
    await waitFor(() => expect(within(screen.getByRole("table")).queryByText("Main Checking")).not.toBeInTheDocument());
    expect(within(screen.getByRole("table")).getByText("Side Savings")).toBeInTheDocument();
  });

  it("archiving calls the archive endpoint exactly once and does not trigger a list reload", async () => {
    accountsApi.listAccounts.mockResolvedValue(ACCOUNTS);
    accountsApi.archiveAccount.mockResolvedValue({});

    renderPage();
    const tbl = await findTable();
    expect(accountsApi.listAccounts).toHaveBeenCalledTimes(1);

    await userEvent.click(tbl.getAllByRole("button", { name: "Archive" })[0]);

    await waitFor(() => expect(within(screen.getByRole("table")).queryByText("Main Checking")).not.toBeInTheDocument());
    expect(accountsApi.archiveAccount).toHaveBeenCalledTimes(1);
    expect(accountsApi.archiveAccount).toHaveBeenCalledWith(1);
    expect(accountsApi.listAccounts).toHaveBeenCalledTimes(1);
  });

  it("groups the type choice by tier, with Other under Everyday", async () => {
    accountsApi.listAccounts.mockResolvedValue(ACCOUNTS);
    renderPage();
    await findTable();
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    await userEvent.click(screen.getByRole("combobox", { name: "Account type" }));

    const groups = await screen.findAllByRole("group");
    const labelled = groups.map((g) => within(g).getAllByRole("option").map((o) => o.textContent));
    expect(labelled).toEqual([
      ["Checking", "Cash", "Credit Card", "Other (everyday)"],
      ["Savings"],
      ["Investment"],
      ["Property"],
      ["Loan"],
    ]);
    expect(within(groups[0]).getByText("Everyday")).toBeInTheDocument();
  });

  it("shows each account's tier", async () => {
    accountsApi.listAccounts.mockResolvedValue([
      { id: 1, name: "Revolut", account_type: "checking", tier: "everyday", current_balance_cents: 0 },
      { id: 3, name: "House", account_type: "property", tier: "property", current_balance_cents: 0 },
    ]);
    renderPage();
    const tbl = await findTable();
    const tierOf = (name) => within(tbl.getByText(name).closest("tr")).getAllByRole("cell")[2].textContent;
    expect(tierOf("House")).toBe("Property");
    expect(tierOf("Revolut")).toBe("Everyday");
  });

  it("creates a mortgage from what is still owed", async () => {
    accountsApi.listAccounts.mockResolvedValue(ACCOUNTS);
    accountsApi.createAccount.mockResolvedValue({});
    renderPage();
    await findTable();
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    await userEvent.type(screen.getByLabelText("Name"), "Mortgage");
    await userEvent.click(screen.getByRole("combobox", { name: "Account type" }));
    await userEvent.click(await screen.findByRole("option", { name: "Loan" }));
    const owed = screen.getByLabelText("Still owed");
    await userEvent.clear(owed);
    await userEvent.type(owed, "250000");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));

    expect(accountsApi.createAccount).toHaveBeenCalledWith({
      name: "Mortgage",
      account_type: "loan",
      starting_balance_cents: -25000000,
    });
  });

  it("rejects a negative amount owed", async () => {
    accountsApi.listAccounts.mockResolvedValue(ACCOUNTS);
    renderPage();
    await findTable();
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));
    await userEvent.type(screen.getByLabelText("Name"), "Mortgage");
    await userEvent.click(screen.getByRole("combobox", { name: "Account type" }));
    await userEvent.click(await screen.findByRole("option", { name: "Loan" }));
    const owed = screen.getByLabelText("Still owed");
    await userEvent.clear(owed);
    await userEvent.type(owed, "-250000");
    await userEvent.click(screen.getByRole("button", { name: "Add account" }));

    expect(accountsApi.createAccount).not.toHaveBeenCalled();
    expect(await screen.findByText("Enter what you still owe as a positive amount.")).toBeInTheDocument();
  });

  it("edits a loan's starting balance as what is owed", async () => {
    accountsApi.listAccounts.mockResolvedValue([
      {
        id: 4,
        name: "Mortgage",
        account_type: "loan",
        tier: "loans",
        starting_balance_cents: -25000000,
        current_balance_cents: -25000000,
      },
    ]);
    accountsApi.updateAccount.mockResolvedValue({});
    renderPage();
    const tbl = await findTable();
    await userEvent.click(tbl.getByRole("button", { name: "Edit" }));
    const owed = screen.getByLabelText("Still owed");
    expect(owed).toHaveValue(250000);
    await userEvent.clear(owed);
    await userEvent.type(owed, "240000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(accountsApi.updateAccount).toHaveBeenCalledWith(4, {
      name: "Mortgage",
      account_type: "loan",
      starting_balance_cents: -24000000,
    });
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as accountsApi from "../api/accounts";
import { AccountsProvider, useAccounts } from "./AccountsContext";

vi.mock("../api/accounts", () => ({ listAccounts: vi.fn() }));

const REVOLUT = { id: 1, name: "Revolut", current_balance_cents: 214000, archived: false };
const CRELAN = { id: 2, name: "Crelan", current_balance_cents: 134200, archived: false };

function Probe() {
  const { defaultAccount, total, setLastOpened, loaded } = useAccounts();
  if (!loaded) return null;
  return (
    <div>
      <p>default {defaultAccount?.name ?? "none"}</p>
      <p>total {total}</p>
      <button type="button" onClick={() => setLastOpened(2)}>
        open Crelan
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <AccountsProvider>
      <Probe />
    </AccountsProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  accountsApi.listAccounts.mockResolvedValue([REVOLUT, CRELAN]);
});

describe("AccountsContext", () => {
  it("defaults to the first account and sums the active balances", async () => {
    renderProbe();

    expect(await screen.findByText("default Revolut")).toBeInTheDocument();
    expect(screen.getByText("total 348200")).toBeInTheDocument();
  });

  it("remembers the last-opened account", async () => {
    const { unmount } = renderProbe();
    await userEvent.click(await screen.findByRole("button", { name: "open Crelan" }));
    expect(screen.getByText("default Crelan")).toBeInTheDocument();
    unmount();

    renderProbe();
    expect(await screen.findByText("default Crelan")).toBeInTheDocument();
  });

  it("falls back when the remembered account is gone or archived", async () => {
    window.localStorage.setItem("reconciled.lastAccount", "2");
    accountsApi.listAccounts.mockResolvedValue([REVOLUT, { ...CRELAN, archived: true }]);
    renderProbe();

    expect(await screen.findByText("default Revolut")).toBeInTheDocument();
    expect(screen.getByText("total 214000")).toBeInTheDocument();
  });
});

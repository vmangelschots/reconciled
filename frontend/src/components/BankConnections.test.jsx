import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/bankSync";
import { BankSyncProvider } from "../bankSync/BankSyncContext";
import { BankRedirectPage } from "../pages/BankRedirectPage";
import { BankConnections } from "./BankConnections";
import { ToastProvider } from "./ui/Toast";

vi.mock("../api/bankSync");

const LINK = {
  id: 7,
  bank_name: "Crelan",
  account_name: "Joint",
  start_date: "2026-10-21",
  last_synced_at: new Date(2026, 10, 11, 18, 32).toISOString(),
  last_added_count: 3,
  last_error: "",
};

const CONNECTION = {
  id: 1,
  bank_name: "Crelan",
  valid_until: "2027-04-20T10:00:00Z",
  ended: false,
  accounts: [{ uid: "u1", name: "Current", iban: "BE00123456789012", currency: "EUR", link: LINK }],
};

const READY = { state: "ready", app_id: "3f2a1234aaaa91c0", stopped: false, redirect_url: "https://b.example/settings/banks" };
const NOT_SET_UP = { ...READY, state: "not_set_up", app_id: "" };

function status(extra) {
  return { enabled: true, credentials: READY, connections: [CONNECTION], waiting_links: [], accounts: [], ...extra };
}

function renderIt() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <BankSyncProvider refreshKey="/settings">
          <BankConnections />
        </BankSyncProvider>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getBanks.mockResolvedValue({ banks: ["Crelan"] });
});

describe("BankConnections", () => {
  it("says when bank sync isn't set up", async () => {
    api.getBankSync.mockResolvedValue({ enabled: false, credentials: NOT_SET_UP });
    renderIt();
    expect(await screen.findByText(/Setup takes about 15 minutes/)).toBeInTheDocument();
    expect(api.getBanks).not.toHaveBeenCalled();
  });

  it("shows a link's last sync and an error", async () => {
    const failing = { ...LINK, last_error: "Enable Banking couldn't be reached." };
    api.getBankSync.mockResolvedValue(
      status({ connections: [{ ...CONNECTION, accounts: [{ ...CONNECTION.accounts[0], link: failing }] }] }),
    );
    renderIt();
    expect(await screen.findByText(/^Last sync (11 Nov|Nov 11) 18:32, 3 lines added$/)).toBeInTheDocument();
    expect(screen.getByText("Enable Banking couldn't be reached.")).toBeInTheDocument();
    expect(screen.getByText(/•••• 9012/)).toBeInTheDocument();
  });

  it("shows the sync status in the panel header, not on the Connect row", async () => {
    api.getBankSync.mockResolvedValue(status());
    api.syncNow.mockResolvedValue({ running: false, added: 3 });
    renderIt();
    const panel = await screen.findByRole("region", { name: "Bank connections" });
    expect(await within(panel).findByRole("button", { name: "Connect" })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument();

    await userEvent.click(within(panel).getByRole("button", { name: /Bank sync/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(await within(panel).findByRole("button", { name: /Bank sync/ })).toHaveTextContent("Synced just now, +3");
    expect(screen.queryByText(/Sync done/)).not.toBeInTheDocument();
  });

  it("offers to reconnect an ended consent", async () => {
    api.getBankSync.mockResolvedValue(status({ connections: [{ ...CONNECTION, ended: true }] }));
    api.authorizeBank.mockResolvedValue({ url: "about:blank" });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Reconnect" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("about:blank"));
    expect(api.authorizeBank).toHaveBeenCalledWith("Crelan");
    vi.unstubAllGlobals();
  });

  it("names accounts waiting after a restore", async () => {
    api.getBankSync.mockResolvedValue(status({ connections: [], waiting_links: [LINK] }));
    renderIt();
    expect(await screen.findByText("Joint needs Crelan reconnected.")).toBeInTheDocument();
  });

  it("disconnects", async () => {
    api.getBankSync.mockResolvedValue(status());
    api.disconnectBank.mockResolvedValue(null);
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(api.disconnectBank).toHaveBeenCalledWith(1));
  });
});

describe("BankRedirectPage", () => {
  function visit(search) {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={[`/settings/banks${search}`]}>
          <Routes>
            <Route path="/settings/banks" element={<BankRedirectPage />} />
            <Route path="/settings" element={<p>Settings page</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
    );
  }

  it("finishes the connection and returns to Settings", async () => {
    api.completeBank.mockResolvedValue({ bank_name: "Crelan" });
    visit("?code=abc&state=xyz");
    expect(await screen.findByText("Settings page")).toBeInTheDocument();
    expect(api.completeBank).toHaveBeenCalledWith("abc", "xyz");
    expect(await screen.findByText("Crelan is connected.")).toBeInTheDocument();
  });

  it("says why when the user cancels at the bank", async () => {
    visit("?error=access_denied&error_description=Cancelled%20by%20user");
    expect(await screen.findByText("Cancelled by user")).toBeInTheDocument();
    expect(api.completeBank).not.toHaveBeenCalled();
  });
});

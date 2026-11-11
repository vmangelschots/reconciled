import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as bankSyncApi from "../api/bankSync";
import { useBankSync } from "../bankSync/BankSyncContext";
import { syncSummary } from "../lib/bankSync";
import { BankSyncStatus } from "./BankSyncStatus";
import { ToastProvider } from "./ui/Toast";

vi.mock("../api/bankSync", () => ({ authorizeBank: vi.fn() }));
vi.mock("../bankSync/BankSyncContext", () => ({ useBankSync: vi.fn() }));

const today = (hours, minutes) => {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};

function link(overrides = {}) {
  return { id: 1, account_name: "Joint", last_synced_at: today(18, 32), last_added_count: 3, last_error: "", ...overrides };
}

function status({ links = [link()], ended = false, running = false, stopped = false, next = today(6, 30) } = {}) {
  return {
    enabled: true,
    running,
    next_sync_at: next,
    credentials: { state: stopped ? "rejected" : "ready", stopped },
    connections: [
      { id: 1, bank_name: "Crelan", ended, accounts: links.map((l, i) => ({ uid: `u${i}`, name: "Zicht", link: l })) },
    ],
    waiting_links: [],
  };
}

let syncNow;
function given(value, result = null) {
  syncNow = vi.fn();
  useBankSync.mockReturnValue({ status: value, summary: syncSummary(value), result, syncNow });
}

function renderStatus() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <BankSyncStatus />
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function open() {
  await userEvent.click(screen.getByRole("button", { name: /Bank sync/ }));
}

let assign;
beforeEach(() => {
  assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("BankSyncStatus", () => {
  it("is hidden when nothing is linked", () => {
    given(status({ links: [null] }));
    renderStatus();
    expect(screen.queryByRole("button", { name: /Bank sync/ })).not.toBeInTheDocument();
  });

  it("shows the last sync and opens the details", async () => {
    given(status());
    renderStatus();
    expect(screen.getByRole("button", { name: /Bank sync/ })).toHaveTextContent("Synced 18:32");

    await open();
    expect(screen.getByText("Crelan → Joint")).toBeInTheDocument();
    expect(screen.getByText("18:32 · 3 lines")).toBeInTheDocument();
    expect(screen.getByText("Next sync 06:30")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sync now" }));
    expect(syncNow).toHaveBeenCalled();
  });

  it("shows no next sync without a schedule", async () => {
    given(status({ next: null }));
    renderStatus();
    await open();
    expect(screen.queryByText(/Next sync/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeEnabled();
  });

  it("shows a running sync and can't start another", async () => {
    given(status({ running: true }));
    renderStatus();
    expect(screen.getByRole("button", { name: /Bank sync/ })).toHaveTextContent("Syncing…");
    await open();
    expect(screen.getByRole("button", { name: "Syncing…" })).toBeDisabled();
  });

  it("shows a sync that just ended", () => {
    given(status(), { added: 5 });
    renderStatus();
    expect(screen.getByRole("button", { name: /Bank sync/ })).toHaveTextContent("Synced just now, +5");
  });

  it("shows a failing bank as an issue with its error", async () => {
    given(status({ links: [link({ id: 2, last_error: "Crelan can't be reached." })] }));
    renderStatus();
    expect(screen.getByRole("button", { name: /Bank sync/ })).toHaveTextContent("Synced 18:32 · 1 issue");
    await open();
    expect(screen.getByText(/Crelan can't be reached\. The next sync tries again\./)).toBeInTheDocument();
  });

  it("offers Reconnect for an ended consent", async () => {
    bankSyncApi.authorizeBank.mockResolvedValue({ url: "https://bank/login" });
    given(status({ ended: true }));
    renderStatus();
    await open();
    expect(screen.getByText("Crelan needs reconnecting")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(bankSyncApi.authorizeBank).toHaveBeenCalledWith("Crelan");
    expect(assign).toHaveBeenCalledWith("https://bank/login");
  });

  it("links to Settings when bank sync stopped", async () => {
    given(status({ stopped: true }));
    renderStatus();
    expect(screen.getByRole("button", { name: /Bank sync/ })).toHaveTextContent("Bank sync stopped");
    await open();
    expect(screen.getByRole("link", { name: "Open Bank connections" })).toHaveAttribute(
      "href",
      "/settings#bank-connections",
    );
    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
  });
});

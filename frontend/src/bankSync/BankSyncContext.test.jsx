import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as bankSyncApi from "../api/bankSync";
import { ToastProvider } from "../components/ui/Toast";
import { BankSyncProvider, useBankSync } from "./BankSyncContext";

vi.mock("../api/bankSync", () => ({ getBankSync: vi.fn(), syncNow: vi.fn() }));

function status(running = false) {
  return {
    enabled: true,
    running,
    next_sync_at: null,
    credentials: { state: "ready", stopped: false },
    connections: [
      {
        id: 1,
        bank_name: "Crelan",
        ended: false,
        accounts: [
          {
            uid: "u1",
            name: "Zicht",
            link: { id: 1, account_name: "Joint", last_synced_at: null, last_added_count: 0, last_error: "" },
          },
        ],
      },
    ],
    waiting_links: [],
  };
}

const sync = {};
function Probe() {
  const value = useBankSync();
  useEffect(() => {
    Object.assign(sync, value);
  });
  return (
    <div>
      <p>version {value.version}</p>
      <p>state {value.summary?.state ?? "hidden"}</p>
      <p>result {value.result ? String(value.result.added) : "none"}</p>
    </div>
  );
}

async function renderProbe() {
  render(
    <ToastProvider>
      <BankSyncProvider refreshKey="/">
        <Probe />
      </BankSyncProvider>
    </ToastProvider>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  bankSyncApi.getBankSync.mockResolvedValue(status());
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("BankSyncContext", () => {
  it("bumps the version after Sync now and shows the result for 5 seconds", async () => {
    bankSyncApi.syncNow.mockResolvedValue({ running: false, added: 3 });
    await renderProbe();
    expect(screen.getByText("version 0")).toBeInTheDocument();

    await act(() => sync.syncNow());
    expect(screen.getByText("version 1")).toBeInTheDocument();
    expect(screen.getByText("result 3")).toBeInTheDocument();
    expect(screen.getByText("state synced")).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(5000));
    expect(screen.getByText("result none")).toBeInTheDocument();
  });

  it("shows a sync as running while Sync now waits", async () => {
    let finish;
    bankSyncApi.syncNow.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await renderProbe();

    let pending;
    act(() => {
      pending = sync.syncNow();
    });
    expect(screen.getByText("state running")).toBeInTheDocument();
    await act(async () => {
      finish({ running: false, added: 0 });
      await pending;
    });
    expect(screen.getByText("state synced")).toBeInTheDocument();
  });

  it("polls a sync that is already running until it ends", async () => {
    bankSyncApi.getBankSync.mockResolvedValue(status(true));
    bankSyncApi.syncNow.mockResolvedValue({ running: true, added: 0 });
    await renderProbe();
    expect(screen.getByText("state running")).toBeInTheDocument();

    await act(() => sync.syncNow());
    expect(screen.getByText("version 0")).toBeInTheDocument();

    bankSyncApi.getBankSync.mockResolvedValue(status(false));
    await act(async () => vi.advanceTimersByTime(3000));
    expect(screen.getByText("state synced")).toBeInTheDocument();
    expect(screen.getByText("version 1")).toBeInTheDocument();
    expect(screen.getByText("result null")).toBeInTheDocument();

    const calls = bankSyncApi.getBankSync.mock.calls.length;
    await act(async () => vi.advanceTimersByTime(9000));
    expect(bankSyncApi.getBankSync.mock.calls.length).toBe(calls);
  });

  it("shows a failed sync as an error and no result", async () => {
    bankSyncApi.syncNow.mockRejectedValue(Object.assign(new Error("x"), { data: { detail: "Bank is down." } }));
    await renderProbe();

    await act(() => sync.syncNow());
    expect(screen.getByText("Bank is down.")).toBeInTheDocument();
    expect(screen.getByText("result none")).toBeInTheDocument();
    expect(screen.getByText("version 0")).toBeInTheDocument();
    expect(screen.getByText("state synced")).toBeInTheDocument();
  });

  it("picks up a sync that started while the tab was hidden", async () => {
    await renderProbe();
    expect(screen.getByText("state synced")).toBeInTheDocument();

    bankSyncApi.getBankSync.mockResolvedValue(status(true));
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("state running")).toBeInTheDocument();

    bankSyncApi.getBankSync.mockResolvedValue(status(false));
    await act(async () => vi.advanceTimersByTime(3000));
    expect(screen.getByText("version 1")).toBeInTheDocument();
  });

  it("keeps the status when reloading on return fails", async () => {
    await renderProbe();
    bankSyncApi.getBankSync.mockRejectedValue(new Error("offline"));
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(screen.getByText("state synced")).toBeInTheDocument();
  });
});

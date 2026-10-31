import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as backupApi from "../api/backup";
import { ToastProvider } from "../components/ui/Toast";
import { backupLine } from "../lib/backup";
import { SettingsPage } from "./SettingsPage";

vi.mock("../api/backup", async () => {
  const actual = await vi.importActual("../api/backup");
  return { ...actual, downloadBackup: vi.fn(), restoreBackup: vi.fn() };
});

vi.mock("../api/bankSync", () => ({ getBankSync: vi.fn().mockResolvedValue({ enabled: false }) }));

const BACKUP = {
  app: "reconciled",
  format_version: 1,
  exported_at: "2026-10-20T14:03:00+00:00",
  migrations: {},
  summary: { accounts: 3, transactions: 1204 },
  data: [],
};

function backupFile(content = JSON.stringify(BACKUP), name = "reconciled-backup-2026-10-20.json") {
  return new File([content], name, { type: "application/json" });
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/" element={<p>Overview page</p>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function pick(file) {
  await userEvent.upload(screen.getByTestId("backup-file"), file, { applyAccept: false });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readBackupSummary", () => {
  it("reads when the backup was made and what it holds", async () => {
    await expect(backupApi.readBackupSummary(backupFile())).resolves.toEqual({
      exportedAt: "2026-10-20T14:03:00+00:00",
      accounts: 3,
      transactions: 1204,
    });
  });

  it("rejects a bank CSV", async () => {
    const csv = backupFile("Datum;Bedrag\n01/10/2026;-6,00\n", "export.csv");
    await expect(backupApi.readBackupSummary(csv)).rejects.toThrow(backupApi.NOT_A_BACKUP);
  });

  it("rejects other JSON", async () => {
    await expect(backupApi.readBackupSummary(backupFile('{"accounts": []}'))).rejects.toThrow(backupApi.NOT_A_BACKUP);
  });

  it("says a cut-off backup can't be read", async () => {
    const content = JSON.stringify(BACKUP);
    await expect(backupApi.readBackupSummary(backupFile(content.slice(0, 40)))).rejects.toThrow(backupApi.UNREADABLE);
  });
});

describe("downloadBackup", () => {
  it("reports a failed download", async () => {
    const { downloadBackup } = await vi.importActual("../api/backup");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    await expect(downloadBackup()).rejects.toThrow("The backup couldn't be made.");
    fetchMock.mockRestore();
  });
});

describe("SettingsPage", () => {
  it("downloads a backup", async () => {
    backupApi.downloadBackup.mockResolvedValue();
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Download backup" }));
    expect(backupApi.downloadBackup).toHaveBeenCalled();
    expect(await screen.findByText("Backup downloaded.")).toBeInTheDocument();
  });

  it("shows why a download failed", async () => {
    backupApi.downloadBackup.mockRejectedValue(new Error("The backup couldn't be made."));
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Download backup" }));
    expect(await screen.findByText("The backup couldn't be made.")).toBeInTheDocument();
  });

  it("says a picked file isn't a backup, without asking to confirm", async () => {
    renderPage();
    await pick(backupFile("Datum;Bedrag\n", "export.csv"));
    expect(await screen.findByText("This file isn't a Reconciled backup.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows what the backup holds before replacing anything", async () => {
    renderPage();
    await pick(backupFile());
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      backupLine({ exportedAt: BACKUP.exported_at, accounts: 3, transactions: 1204 }),
    );
    expect(dialog).toHaveTextContent(/3 accounts · 1,204 transactions/);
    expect(dialog).toHaveTextContent("Everything now in the app is replaced by the backup.");
    expect(backupApi.restoreBackup).not.toHaveBeenCalled();
  });

  it("changes nothing when cancelled", async () => {
    renderPage();
    await pick(backupFile());
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(backupApi.restoreBackup).not.toHaveBeenCalled();
  });

  it("restores, confirms and goes to the Overview", async () => {
    backupApi.restoreBackup.mockResolvedValue({ accounts: 3, transactions: 1204 });
    renderPage();
    const file = backupFile();
    await pick(file);
    await userEvent.click(await screen.findByRole("button", { name: "Replace everything" }));

    expect(backupApi.restoreBackup).toHaveBeenCalledWith(file);
    expect(await screen.findByText("Restored 3 accounts and 1,204 transactions.")).toBeInTheDocument();
    expect(screen.getByText("Overview page")).toBeInTheDocument();
  });

  it("shows the server's reason when a restore fails", async () => {
    const error = new Error("Request failed");
    error.data = {
      detail: "This backup was made by a newer version of Reconciled. Update the app, then restore it.",
    };
    backupApi.restoreBackup.mockRejectedValue(error);
    renderPage();
    await pick(backupFile());
    await userEvent.click(await screen.findByRole("button", { name: "Replace everything" }));

    expect(await screen.findByText(error.data.detail)).toBeInTheDocument();
    expect(screen.queryByText("Overview page")).not.toBeInTheDocument();
  });
});

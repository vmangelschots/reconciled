import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/bankSync";
import { BankCredentials, credentialsBadge } from "./BankCredentials";
import { ToastProvider } from "./ui/Toast";

vi.mock("../api/bankSync");

const URL = "https://b.example/settings/banks";
const creds = (extra) => ({ state: "not_set_up", app_id: "", stopped: false, redirect_url: URL, ...extra });

function renderIt(credentials, onChange = vi.fn()) {
  render(
    <ToastProvider>
      <BankCredentials credentials={credentials} onChange={onChange} />
    </ToastProvider>,
  );
  return onChange;
}

async function goToKeyStep() {
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
}

beforeEach(() => vi.clearAllMocks());

describe("BankCredentials", () => {
  it("walks through the steps and shows the exact redirect URL", async () => {
    renderIt(creds());
    expect(screen.getByText(/Setup takes about 15 minutes/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("textbox", { name: "redirect URL" })).toHaveValue(URL);
  });

  it("copies, and says what to press when there's no clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    renderIt(creds());
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Copy redirect URL" }));
    expect(await screen.findByText("Press Ctrl+C")).toBeInTheDocument();
  });

  it("fills in the application id from the key file and sends it once", async () => {
    api.saveBankCredentials.mockResolvedValue({});
    const onChange = renderIt(creds());
    await goToKeyStep();
    const file = new File(["-----BEGIN PRIVATE KEY-----"], "abc-123.pem");
    await userEvent.upload(screen.getByTestId("bank-key-file"), file);
    await waitFor(() => expect(screen.getByLabelText("Application ID")).toHaveValue("abc-123"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(api.saveBankCredentials).toHaveBeenCalledWith({
      app_id: "abc-123",
      private_key: "-----BEGIN PRIVATE KEY-----",
    });
  });

  it("can paste the key instead", async () => {
    renderIt(creds());
    await goToKeyStep();
    await userEvent.click(screen.getByRole("button", { name: "Paste the key instead" }));
    expect(screen.getByLabelText("Private key")).toBeInTheDocument();
  });

  it("shows the server's reason for a bad key", async () => {
    api.saveBankCredentials.mockRejectedValue({ data: { detail: "That isn't a valid private key." } });
    renderIt(creds());
    await goToKeyStep();
    await userEvent.click(screen.getByRole("button", { name: "Paste the key instead" }));
    await userEvent.type(screen.getByLabelText("Private key"), "nope");
    await userEvent.type(screen.getByLabelText("Application ID"), "app");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("That isn't a valid private key.")).toBeInTheDocument();
  });

  it.each([
    ["rejected", "Enable Banking didn't accept this key.", false],
    ["redirect_missing", "This redirect URL isn't on your app yet.", true],
    ["not_active", "Your app isn't active yet.", true],
    ["sandbox", "This is a sandbox app", false],
    ["unreachable", "Saved, but Enable Banking couldn't be reached", true],
  ])("says what to do for %s", (state, text, canCheck) => {
    renderIt(creds({ state, app_id: "app" }));
    expect(screen.getByText(new RegExp(text))).toBeInTheDocument();
    expect(Boolean(screen.queryByRole("button", { name: "Check again" }))).toBe(canCheck);
  });

  it("shows the redirect URL again when it's the thing missing", () => {
    renderIt(creds({ state: "redirect_missing", app_id: "app" }));
    expect(screen.getByRole("textbox", { name: "redirect URL" })).toHaveValue(URL);
  });

  it("checks again", async () => {
    api.checkBankCredentials.mockResolvedValue({});
    const onChange = renderIt(creds({ state: "not_active", app_id: "app" }));
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("collapses to one line once ready, never showing the key", () => {
    renderIt(creds({ state: "ready", app_id: "3f2a1234aaaa91c0" }));
    expect(screen.getByText("Enable Banking is set up · App 3f2a…91c0 · Key saved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("confirms before replacing the key", async () => {
    renderIt(creds({ state: "ready", app_id: "app" }));
    await userEvent.click(screen.getByRole("button", { name: "Replace key" }));
    expect(await screen.findByText(/you'll need to reconnect your banks/)).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Replace key" }));
    expect(await screen.findByRole("button", { name: "Upload .pem file" })).toBeInTheDocument();
  });

  it("warns once when sync stopped", () => {
    renderIt(creds({ state: "rejected", app_id: "app", stopped: true }));
    expect(screen.getAllByText(/Bank sync stopped because Enable Banking no longer accepts your key/)).toHaveLength(1);
  });

  it("has a badge for every state but not being set up", () => {
    expect(credentialsBadge(creds())).toBeNull();
    for (const state of ["ready", "rejected", "redirect_missing", "not_active", "sandbox", "unreachable"]) {
      expect(credentialsBadge(creds({ state }))).not.toBeNull();
    }
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/household";
import { AiSection } from "./AiSection";
import { HouseholdSection } from "./HouseholdSection";
import { HouseholdSwitcher } from "./HouseholdSwitcher";
import { ToastProvider } from "./ui/Toast";

vi.mock("../api/household");

let user;
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user }) }));

const HOUSEHOLD = {
  id: 1,
  name: "The Peeters household",
  members: [
    { username: "ann", you: true },
    { username: "bob", you: false },
  ],
  invites: [{ id: 9, created_by: "bob", expires_at: "2026-11-08T10:00:00Z" }],
  can_leave: false,
  ai_available: true,
  ai_enabled: false,
};

function renderIt(element) {
  return render(<ToastProvider>{element}</ToastProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getHousehold.mockResolvedValue(HOUSEHOLD);
});

describe("HouseholdSection", () => {
  it("shows the name and members, marking you", async () => {
    renderIt(<HouseholdSection />);
    expect(await screen.findByText("The Peeters household")).toBeInTheDocument();
    expect(screen.getByText("ann")).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("makes an invite link and shows it", async () => {
    api.createInvite.mockResolvedValue({ id: 10, token: "tok" });
    renderIt(<HouseholdSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Invite someone" }));
    expect(await screen.findByRole("textbox", { name: "invite link" })).toHaveValue(
      `${window.location.origin}/invite/tok`,
    );
  });

  it("revokes a waiting invite", async () => {
    api.revokeInvite.mockResolvedValue(null);
    renderIt(<HouseholdSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(api.revokeInvite).toHaveBeenCalledWith(9);
  });

  it("only offers leaving when it's allowed", async () => {
    renderIt(<HouseholdSection />);
    await screen.findByText("ann");
    expect(screen.queryByRole("button", { name: "Leave household" })).not.toBeInTheDocument();
  });

  it("confirms leaving", async () => {
    api.getHousehold.mockResolvedValue({ ...HOUSEHOLD, can_leave: true });
    renderIt(<HouseholdSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Leave household" }));
    expect(await screen.findByText("Leave The Peeters household?")).toBeInTheDocument();
  });

  it("changes the password", async () => {
    api.changePassword.mockResolvedValue(null);
    renderIt(<HouseholdSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Change password" }));
    await userEvent.type(await screen.findByLabelText("Current password"), "old");
    await userEvent.type(screen.getByLabelText("New password"), "new");
    await userEvent.click(screen.getByRole("dialog").querySelector("button[type=submit]"));
    expect(await screen.findByText("Password changed.")).toBeInTheDocument();
    expect(api.changePassword).toHaveBeenCalledWith({ current_password: "old", new_password: "new" });
  });
});

describe("AiSection", () => {
  it("asks before turning on, saying what is sent and to whom", async () => {
    api.setAiChoice.mockResolvedValue({ ai_enabled: true });
    renderIt(<AiSection />);
    await userEvent.click(await screen.findByRole("button", { name: "On" }));
    expect(await screen.findByText(/payee names, payment notes, amounts and your category names/)).toBeInTheDocument();
    expect(api.setAiChoice).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(api.setAiChoice).toHaveBeenCalledWith(true));
  });

  it("turns off without asking", async () => {
    api.getHousehold.mockResolvedValue({ ...HOUSEHOLD, ai_enabled: true });
    api.setAiChoice.mockResolvedValue({ ai_enabled: false });
    renderIt(<AiSection />);
    await userEvent.click(await screen.findByRole("button", { name: "Off" }));
    await waitFor(() => expect(api.setAiChoice).toHaveBeenCalledWith(false));
  });

  it("isn't shown when the server has no key", async () => {
    api.getHousehold.mockResolvedValue({ ...HOUSEHOLD, ai_available: false });
    const { container } = renderIt(<AiSection />);
    await waitFor(() => expect(api.getHousehold).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });
});

describe("HouseholdSwitcher", () => {
  it("isn't there for one household", () => {
    user = { household: { id: 1, name: "One" }, households: [{ id: 1, name: "One" }] };
    renderIt(<HouseholdSwitcher />);
    expect(screen.queryByRole("combobox", { name: "Household" })).not.toBeInTheDocument();
  });

  it("shows the active household when there are two", () => {
    user = {
      household: { id: 1, name: "One" },
      households: [
        { id: 1, name: "One" },
        { id: 2, name: "Two" },
      ],
    };
    renderIt(<HouseholdSwitcher />);
    expect(screen.getByRole("combobox", { name: "Household" })).toHaveTextContent("One");
  });
});

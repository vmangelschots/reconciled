import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/household";
import { ToastProvider } from "../components/ui/Toast";
import { InvitePage } from "./InvitePage";

vi.mock("../api/household");

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={["/invite/tok"]}>
        <Routes>
          <Route path="/invite/:token" element={<InvitePage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

const INVITE = { household: "The Peeters household", signed_in_as: null, already_member: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("location", { ...window.location, assign: vi.fn() });
});

describe("InvitePage", () => {
  it("names the household and warns what members see", async () => {
    api.getInvite.mockResolvedValue(INVITE);
    renderPage();
    expect(await screen.findByText(/join The Peeters household/)).toBeInTheDocument();
    expect(screen.getByText("Members see all of the household's data.")).toBeInTheDocument();
  });

  it("makes a new login", async () => {
    api.getInvite.mockResolvedValue(INVITE);
    api.acceptInvite.mockResolvedValue({});
    renderPage();
    await userEvent.type(await screen.findByLabelText("Username"), "newbie");
    await userEvent.type(screen.getByLabelText("Password"), "a long password");
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith("/"));
    expect(api.acceptInvite).toHaveBeenCalledWith("tok", {
      username: "newbie",
      password: "a long password",
      existing: false,
    });
  });

  it("signs in with an existing login", async () => {
    api.getInvite.mockResolvedValue(INVITE);
    api.acceptInvite.mockResolvedValue({});
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "I have a login" }));
    await userEvent.type(screen.getByLabelText("Username"), "ann");
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(api.acceptInvite).toHaveBeenCalled());
    expect(api.acceptInvite.mock.calls[0][1].existing).toBe(true);
  });

  it("just asks a signed-in user to confirm", async () => {
    api.getInvite.mockResolvedValue({ ...INVITE, signed_in_as: "ann" });
    api.acceptInvite.mockResolvedValue({});
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Join as ann" }));
    await waitFor(() => expect(api.acceptInvite).toHaveBeenCalledWith("tok", {}));
  });

  it("says when they're already a member", async () => {
    api.getInvite.mockResolvedValue({ ...INVITE, signed_in_as: "ann", already_member: true });
    renderPage();
    expect(await screen.findByText(/already a member/)).toBeInTheDocument();
  });

  it("says a bad link no longer works, and nothing else", async () => {
    api.getInvite.mockRejectedValue(new Error("nope"));
    renderPage();
    expect(await screen.findByText("This invite link no longer works. Ask for a new one.")).toBeInTheDocument();
  });

  it("shows why a login couldn't be made and keeps the form", async () => {
    api.getInvite.mockResolvedValue(INVITE);
    api.acceptInvite.mockRejectedValue({ data: { detail: "That username is already taken." } });
    renderPage();
    await userEvent.type(await screen.findByLabelText("Username"), "ann");
    await userEvent.type(screen.getByLabelText("Password"), "a long password");
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(await screen.findByText("That username is already taken.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeEnabled();
  });
});

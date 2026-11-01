import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ui/Toast";
import { LoginPage } from "./LoginPage";

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ login: vi.fn() }) }));

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

describe("LoginPage", () => {
  it("says how to get a login, and offers no way to create one", () => {
    renderPage();
    expect(
      screen.getByText("New here? Ask someone in your household, or whoever runs Reconciled, for an invite link."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Sign in"]);
  });
});

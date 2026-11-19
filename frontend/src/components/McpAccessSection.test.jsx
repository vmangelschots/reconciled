import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/mcpTokens";
import { McpAccessSection } from "./McpAccessSection";
import { ToastProvider } from "./ui/Toast";

vi.mock("../api/mcpTokens");

const LAPTOP = { id: 1, name: "Laptop Claude Code", shown: "rcn_a1b2c3", created_at: "2026-11-01T10:00:00Z", last_used_at: null };

function renderIt() {
  return render(
    <ToastProvider>
      <McpAccessSection />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listTokens.mockResolvedValue([LAPTOP]);
  api.mcpEndpoint.mockReturnValue("https://budget.example.com/mcp");
});

describe("McpAccessSection", () => {
  it("lists tokens by name and first characters, never the token", async () => {
    renderIt();
    expect(await screen.findByText("Laptop Claude Code")).toBeInTheDocument();
    expect(screen.getByText(/rcn_a1b2c3… · Created .* · Never used/)).toBeInTheDocument();
    expect(screen.getByText(/passes what it reads on to its model provider/)).toBeInTheDocument();
  });

  it("shows the endpoint and a snippet with a placeholder", async () => {
    renderIt();
    expect(await screen.findByRole("textbox", { name: "MCP endpoint" })).toHaveValue("https://budget.example.com/mcp");
    const snippet = screen.getByLabelText("client configuration");
    expect(snippet).toHaveTextContent("https://budget.example.com/mcp");
    expect(snippet).toHaveTextContent("Bearer <your token>");
  });

  it("creates a token and shows it once, in the snippet too", async () => {
    api.createToken.mockResolvedValue({ ...LAPTOP, id: 2, name: "Desktop", token: "rcn_secret" });
    renderIt();
    await userEvent.type(await screen.findByLabelText("New token"), "  Desktop ");
    await userEvent.click(screen.getByRole("button", { name: "Create token" }));
    expect(api.createToken).toHaveBeenCalledWith("Desktop");
    expect(await screen.findByRole("textbox", { name: "access token" })).toHaveValue("rcn_secret");
    expect(screen.getByText(/It won't be shown again/)).toBeInTheDocument();
    expect(screen.getByLabelText("client configuration")).toHaveTextContent("Bearer rcn_secret");
    expect(screen.getByLabelText("New token")).toHaveValue("");
  });

  it("needs a name", async () => {
    renderIt();
    await screen.findByLabelText("New token");
    await userEvent.click(screen.getByRole("button", { name: "Create token" }));
    expect(screen.getByText("Give the token a name.")).toBeInTheDocument();
    expect(api.createToken).not.toHaveBeenCalled();
  });

  it("copies the snippet", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Copy client configuration" }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"url": "https://budget.example.com/mcp"'));
  });

  it("revokes after confirming", async () => {
    api.revokeToken.mockResolvedValue(null);
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Revoke “Laptop Claude Code”?")).toBeInTheDocument();
    api.listTokens.mockResolvedValue([]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Revoke token" }));
    expect(api.revokeToken).toHaveBeenCalledWith(1);
    expect(screen.queryByText("Laptop Claude Code")).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";
import { clientSnippet, lastUsed, TOKEN_PLACEHOLDER } from "./mcp";

describe("clientSnippet", () => {
  it("puts the URL and token in a bearer header", () => {
    const config = JSON.parse(clientSnippet("https://budget.example.com/mcp", "rcn_abc"));
    expect(config.mcpServers.reconciled).toEqual({
      type: "http",
      url: "https://budget.example.com/mcp",
      headers: { Authorization: "Bearer rcn_abc" },
    });
  });

  it("uses a placeholder without a token", () => {
    expect(clientSnippet("u", null)).toContain(`Bearer ${TOKEN_PLACEHOLDER}`);
  });
});

describe("lastUsed", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  it("says when", () => {
    expect(lastUsed(null, now)).toBe("Never used");
    expect(lastUsed("2026-11-19T11:59:40Z", now)).toBe("Used just now");
    expect(lastUsed("2026-11-19T11:55:00Z", now)).toMatch(/^Used 5 minutes ago$/);
    expect(lastUsed("2026-11-19T09:00:00Z", now)).toMatch(/^Used 3 hours ago$/);
    expect(lastUsed("2026-11-12T12:00:00Z", now)).toMatch(/^Used 7 days ago$/);
  });
});

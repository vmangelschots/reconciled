import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("./mcpTokens");
}

function stubFetch(body = "[]", status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("MCP token API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("lists, creates and revokes", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const fetchMock = stubFetch('{"id": 3, "token": "rcn_x"}', 201);
    const api = await load();

    await api.createToken("Laptop");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/mcp-tokens/");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Laptop" });

    fetchMock.mockResolvedValue(new Response("[]", { status: 200 }));
    await api.listTokens();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/mcp-tokens/");

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await api.revokeToken(3);
    expect(fetchMock.mock.calls[2][0]).toBe("/api/mcp-tokens/3/");
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
  });

  it("names the endpoint on this page's origin when the API is same-origin", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const api = await load();
    expect(api.mcpEndpoint()).toBe(`${window.location.origin}/mcp`);
  });

  it("names the endpoint on the configured API base", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8000");
    const api = await load();
    expect(api.mcpEndpoint()).toBe("http://localhost:8000/mcp");
  });
});

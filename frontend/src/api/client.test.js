import { afterEach, describe, expect, it, vi } from "vitest";

async function loadClient() {
  vi.resetModules();
  return import("./client");
}

describe("apiFetch base URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stubFetch() {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("calls the page's own origin when VITE_API_BASE_URL is empty", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    const fetchMock = stubFetch();
    const { apiFetch } = await loadClient();

    await apiFetch("/api/accounts/");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/accounts/");
  });

  it("uses the configured base URL when one is set", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const fetchMock = stubFetch();
    const { apiFetch } = await loadClient();

    await apiFetch("/api/accounts/");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/api/accounts/");
  });

  it("falls back to localhost:8000 when unset", async () => {
    vi.stubEnv("VITE_API_BASE_URL", undefined);
    const fetchMock = stubFetch();
    const { apiFetch } = await loadClient();

    await apiFetch("/api/accounts/");

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/accounts/");
  });
});

describe("the household header", () => {
  it("sends the household this page loaded", async () => {
    const { apiFetch, setActiveHousehold } = await loadClient();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setActiveHousehold(7);
    await apiFetch("/api/accounts/");
    expect(fetchMock.mock.calls[0][1].headers["X-Household"]).toBe("7");
    setActiveHousehold(null);
    await apiFetch("/api/accounts/");
    expect(fetchMock.mock.calls[1][1].headers["X-Household"]).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it("reloads with a message when the household changed in another tab", async () => {
    const { apiFetch, takeNotice } = await loadClient();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"detail":"x"}', { status: 409 })));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    await expect(apiFetch("/api/accounts/")).rejects.toThrow();
    expect(assign).toHaveBeenCalledWith("/");
    expect(takeNotice()).toBe("Your household changed, so this page reloaded.");
    expect(takeNotice()).toBeNull();
    vi.unstubAllGlobals();
  });
});

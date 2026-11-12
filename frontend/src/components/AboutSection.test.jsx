import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/version";
import { appVersion } from "../lib/version";
import { AboutSection } from "./AboutSection";

vi.mock("../api/version");

// The real module's appVersion object, rewritten per test as a build would.
vi.mock("../lib/version", async () => {
  const actual = await vi.importActual("../lib/version");
  return { ...actual, appVersion: { ...actual.appVersion } };
});

function build(version, commit = version, built = "2026-11-12T14:03:00Z") {
  return { version, commit, built };
}

function setApp(info) {
  Object.assign(appVersion, info);
}

function row(title) {
  return screen.getByText(title).closest("div").parentElement;
}

const MISMATCH = /different versions/;

beforeEach(() => {
  vi.clearAllMocks();
  setApp(build("a1b2c3d"));
});

describe("AboutSection", () => {
  it("shows the app and server builds", async () => {
    api.fetchServerVersion.mockResolvedValue(build("a1b2c3d"));
    render(<AboutSection />);
    expect(await within(row("Server")).findByText("a1b2c3d")).toBeInTheDocument();
    expect(within(row("App")).getByText("a1b2c3d")).toBeInTheDocument();
    expect(within(row("App")).getByText(/^built /)).toBeInTheDocument();
    expect(screen.queryByText(MISMATCH)).not.toBeInTheDocument();
  });

  it("shows a release's commit next to it", async () => {
    setApp(build("1.4.0", "a1b2c3d"));
    api.fetchServerVersion.mockResolvedValue(build("1.4.0", "a1b2c3d"));
    render(<AboutSection />);
    expect(await within(row("Server")).findByText("1.4.0")).toBeInTheDocument();
    expect(within(row("App")).getByText(/commit a1b2c3d · built/)).toBeInTheDocument();
  });

  it("keeps the app version when the server's can't be loaded", async () => {
    api.fetchServerVersion.mockRejectedValue(new Error("nope"));
    render(<AboutSection />);
    expect(await screen.findByText("Couldn't load")).toBeInTheDocument();
    expect(within(row("App")).getByText("a1b2c3d")).toBeInTheDocument();
    expect(screen.queryByText(MISMATCH)).not.toBeInTheDocument();
  });

  it("warns when app and server differ", async () => {
    api.fetchServerVersion.mockResolvedValue(build("f9e8d7c"));
    render(<AboutSection />);
    expect(await screen.findByText(MISMATCH)).toBeInTheDocument();
  });

  it("shows only dev for local builds, without a warning", async () => {
    setApp({ version: "dev", commit: null, built: null });
    api.fetchServerVersion.mockResolvedValue(build("f9e8d7c"));
    render(<AboutSection />);
    expect(await within(row("Server")).findByText("f9e8d7c")).toBeInTheDocument();
    expect(within(row("App")).getByText("dev")).toBeInTheDocument();
    expect(within(row("App")).queryByText(/built/)).not.toBeInTheDocument();
    expect(screen.queryByText(MISMATCH)).not.toBeInTheDocument();
  });
});

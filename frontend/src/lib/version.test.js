import { describe, expect, it } from "vitest";
import { appVersion, versionDetail, versionsDiffer } from "./version";

describe("appVersion", () => {
  it("is dev when the build didn't stamp one", () => {
    expect(appVersion.version).toBe("dev");
  });
});

describe("versionsDiffer", () => {
  it("flags different builds", () => {
    expect(versionsDiffer({ version: "a1b2c3d" }, { version: "f9e8d7c" })).toBe(true);
  });

  it("is quiet for the same build", () => {
    expect(versionsDiffer({ version: "a1b2c3d" }, { version: "a1b2c3d" })).toBe(false);
  });

  it("never flags dev builds", () => {
    expect(versionsDiffer({ version: "dev" }, { version: "a1b2c3d" })).toBe(false);
    expect(versionsDiffer({ version: "a1b2c3d" }, { version: "dev" })).toBe(false);
  });

  it("is quiet while the server version is unknown", () => {
    expect(versionsDiffer({ version: "a1b2c3d" }, null)).toBe(false);
  });
});

describe("versionDetail", () => {
  it("shows the commit only when the version isn't the commit", () => {
    expect(versionDetail({ version: "1.4.0", commit: "a1b2c3d", built: null })).toBe("commit a1b2c3d");
    expect(versionDetail({ version: "a1b2c3d", commit: "a1b2c3d", built: null })).toBe("");
  });

  it("shows when it was built", () => {
    expect(versionDetail({ version: "a1b2c3d", commit: "a1b2c3d", built: "2026-11-12T14:03:00Z" })).toMatch(
      /^built .*2026/,
    );
  });

  it("is empty for dev", () => {
    expect(versionDetail({ version: "dev", commit: null, built: null })).toBe("");
  });
});

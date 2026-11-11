import { describe, expect, it } from "vitest";
import { bankLinks, formatSyncTime, formatSyncedAt, syncLabel, syncSummary } from "./bankSync";

const NOW = new Date(2026, 10, 11, 20, 0);
const at = (day, hours, minutes) => new Date(2026, 10, day, hours, minutes).toISOString();

function link(overrides = {}) {
  return {
    id: 1,
    account_name: "Joint",
    last_synced_at: at(11, 18, 32),
    last_added_count: 3,
    last_error: "",
    ...overrides,
  };
}

function status({ links = [link()], ended = false, waiting = [], running = false, stopped = false, state = "ready" } = {}) {
  return {
    enabled: true,
    running,
    next_sync_at: null,
    credentials: { state, stopped },
    connections: [
      {
        id: 1,
        bank_name: "Crelan",
        ended,
        accounts: links.map((l, i) => ({ uid: `u${i}`, name: "Zicht", link: l })),
      },
    ],
    waiting_links: waiting,
  };
}

describe("formatSyncedAt", () => {
  it("shows only the time today", () => {
    expect(formatSyncedAt(at(11, 18, 32), NOW)).toBe("18:32");
  });

  it("says yesterday", () => {
    expect(formatSyncedAt(at(10, 18, 32), NOW)).toBe("yesterday 18:32");
  });

  it("shows the date earlier", () => {
    const text = formatSyncedAt(at(9, 18, 32), NOW);
    expect(text).toMatch(/9/);
    expect(text).toMatch(/Nov/);
    expect(text).toMatch(/18:32$/);
  });

  it("gives a link's date and time", () => {
    expect(formatSyncTime(at(11, 18, 32))).toMatch(/^(11 Nov|Nov 11) 18:32$/);
  });
});

describe("syncSummary", () => {
  it("is hidden when bank sync isn't set up", () => {
    expect(syncSummary({ enabled: false, credentials: { state: "not_set_up" } })).toBeNull();
  });

  it("is hidden when nothing is linked", () => {
    expect(syncSummary(status({ links: [null] }))).toBeNull();
  });

  it("is hidden while the credentials don't work yet", () => {
    expect(syncSummary(status({ state: "redirect_missing" }))).toBeNull();
  });

  it("uses the latest successful sync", () => {
    const summary = syncSummary(status({ links: [link({ last_synced_at: at(10, 6, 30) }), link({ id: 2 })] }));
    expect(summary.state).toBe("synced");
    expect(syncLabel(summary, null, NOW)).toBe("Synced 18:32");
  });

  it("says when nothing has synced yet", () => {
    expect(syncLabel(syncSummary(status({ links: [link({ last_synced_at: null })] })), null, NOW)).toBe(
      "Not synced yet",
    );
  });

  it("shows a running sync", () => {
    const summary = syncSummary(status({ running: true }));
    expect(summary.state).toBe("running");
    expect(syncLabel(summary, null, NOW)).toBe("Syncing…");
  });

  it("shows a sync that just ended", () => {
    const summary = syncSummary(status());
    expect(syncLabel(summary, { added: 5 }, NOW)).toBe("Synced just now, +5");
    expect(syncLabel(summary, { added: 0 }, NOW)).toBe("Synced just now");
    expect(syncLabel(summary, { added: null }, NOW)).toBe("Synced just now");
  });

  it("counts a failing link as an issue", () => {
    const summary = syncSummary(status({ links: [link({ id: 2, last_error: "Crelan is down" }), link()] }));
    expect(summary.issues).toBe(1);
    expect(syncLabel(summary, null, NOW)).toBe("Synced 18:32 · 1 issue");
  });

  it("counts an ended consent as needing reconnecting", () => {
    const summary = syncSummary(status({ ended: true }));
    expect(summary.links[0].problem).toBe("reconnect");
    expect(summary.issues).toBe(1);
  });

  it("counts a link waiting for its bank", () => {
    const waiting = { id: 9, bank_name: "Revolut", account_name: "Card", last_synced_at: null, last_error: "" };
    const summary = syncSummary(status({ waiting: [waiting] }));
    expect(bankLinks(status({ waiting: [waiting] }))).toHaveLength(2);
    expect(summary.issues).toBe(1);
  });

  it("shows bank sync stopped", () => {
    const summary = syncSummary(status({ stopped: true, state: "rejected" }));
    expect(summary.state).toBe("stopped");
    expect(syncLabel(summary, null, NOW)).toBe("Bank sync stopped");
  });

  it("leaves out the word Synced on a phone", () => {
    expect(syncLabel(syncSummary(status()), null, NOW, true)).toBe("18:32");
  });
});

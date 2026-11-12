import { describe, expect, it, vi } from "vitest";
import { notifyDataChanged, onDataChanged } from "./dataChanged";

describe("dataChanged", () => {
  it("calls every listener until it unsubscribes", () => {
    const a = vi.fn();
    const b = vi.fn();
    const offA = onDataChanged(a);
    const offB = onDataChanged(b);
    notifyDataChanged();
    offA();
    notifyDataChanged();
    offB();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("keeps calling the others when one throws", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn();
    const offBad = onDataChanged(() => {
      throw new Error("boom");
    });
    const offAfter = onDataChanged(after);
    notifyDataChanged();
    expect(after).toHaveBeenCalledTimes(1);
    offBad();
    offAfter();
    error.mockRestore();
  });
});

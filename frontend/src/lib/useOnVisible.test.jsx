import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOnVisible } from "./useOnVisible";

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useOnVisible", () => {
  afterEach(() => setVisibility("visible"));

  it("calls back once when the tab comes back, and not after unmount", () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useOnVisible(callback));
    setVisibility("hidden");
    expect(callback).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(callback).toHaveBeenCalledTimes(1);
    unmount();
    setVisibility("hidden");
    setVisibility("visible");
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

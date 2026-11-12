import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCoalescedRefresh } from "./useCoalescedRefresh";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useCoalescedRefresh", () => {
  it("queues one more load for any number of asks during a load, applying only the newest", async () => {
    const pending = [deferred(), deferred()];
    let call = 0;
    const load = vi.fn(() => pending[call++].promise);
    const onLoad = vi.fn();
    const { result } = renderHook(() => useCoalescedRefresh(load, onLoad));

    await act(async () => result.current());
    await act(async () => {
      result.current();
      result.current();
      result.current();
    });
    await act(async () => pending[0].resolve("old"));
    await act(async () => pending[1].resolve("new"));

    expect(load).toHaveBeenCalledTimes(2);
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith("new");
  });

  it("keeps the previous value when a load fails, but still settles", async () => {
    const load = vi.fn().mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("offline"));
    const onLoad = vi.fn();
    const onSettled = vi.fn();
    const { result } = renderHook(() => useCoalescedRefresh(load, onLoad, onSettled));

    await act(async () => result.current());
    await act(async () => result.current());

    expect(onLoad.mock.calls).toEqual([[1]]);
    expect(onSettled).toHaveBeenCalledTimes(2);
  });

  it("starts a fresh load after the previous one finished", async () => {
    const load = vi.fn().mockResolvedValue(1);
    const { result } = renderHook(() => useCoalescedRefresh(load, () => {}));
    await act(async () => result.current());
    await act(async () => result.current());
    expect(load).toHaveBeenCalledTimes(2);
  });
});

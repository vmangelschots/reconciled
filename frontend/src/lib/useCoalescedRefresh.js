import { useCallback, useEffect, useRef } from "react";

/**
 * A reload function for shared data that keeps at most one load in flight.
 * Asking again while a load runs queues exactly one more, and only the
 * newest result is applied - so a burst of saves causes one extra reload and
 * an older response never overwrites a newer one. A failed load keeps what
 * is shown. `onSettled` runs whenever a round of loading ends, success or not.
 */
export function useCoalescedRefresh(load, onLoad, onSettled) {
  const latest = useRef({ load, onLoad, onSettled });
  useEffect(() => {
    latest.current = { load, onLoad, onSettled };
  });
  const state = useRef({ running: false, dirty: false, alive: true });
  useEffect(() => {
    const s = state.current;
    s.alive = true;
    return () => {
      s.alive = false;
    };
  }, []);

  return useCallback(() => {
    const s = state.current;
    if (s.running) {
      s.dirty = true;
      return;
    }
    s.running = true;
    const run = () => {
      s.dirty = false;
      Promise.resolve()
        .then(() => latest.current.load())
        .then(
          (value) => ({ ok: true, value }),
          () => ({ ok: false }),
        )
        .then((result) => {
          if (!s.alive) {
            s.running = false;
            return;
          }
          // Something changed while this was loading: its answer is old.
          if (s.dirty) {
            run();
            return;
          }
          s.running = false;
          if (result.ok) latest.current.onLoad?.(result.value);
          latest.current.onSettled?.();
        });
    };
    run();
  }, []);
}

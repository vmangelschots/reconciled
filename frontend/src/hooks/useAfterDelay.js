import { useEffect, useState } from "react";

// True once `active` has stayed true for `ms`, for hints like "this can
// take up to a minute" that would only be noise on a quick run.
export function useAfterDelay(active, ms) {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, ms]);

  return active && elapsed;
}

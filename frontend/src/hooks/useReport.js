import { useEffect, useState } from "react";
import { useToast } from "../components/ui/Toast";

function errorMessage(e) {
  return e.data ? Object.values(e.data).flat().join(" ") : e.message;
}

// Loads one report and tracks its own loading/error state, so one failing
// panel never blanks the others. Responses for a superseded key (a month
// the user already moved past) are dropped. A null key loads nothing.
export function useReport(load, key) {
  const toast = useToast();
  const [state, setState] = useState({ data: null, error: null, loading: key != null });

  useEffect(() => {
    if (key == null) return undefined;
    let current = true;
    setState((prev) => ({ ...prev, loading: true }));
    load()
      .then((data) => current && setState({ data, error: null, loading: false }))
      .catch((e) => {
        if (!current) return;
        setState({ data: null, error: e, loading: false });
        toast.error(errorMessage(e));
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

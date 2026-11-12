import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getBankSync, syncNow as runSync } from "../api/bankSync";
import { useToast } from "../components/ui/Toast";
import { syncSummary } from "../lib/bankSync";
import { useOnVisible } from "../lib/useOnVisible";

// The household's bank sync, shared by the page headers' sync status and
// Settings' Bank connections - see specs/bank-sync, "Sync status". Layout
// provides it. The status reloads on route changes and when the tab is shown
// again, so a scheduled sync that started meanwhile gets polled too.
// `version` goes up whenever a sync ends, so pages can reload.
const POLL_MS = 3000;
const RESULT_MS = 5000;

const BankSyncContext = createContext({
  status: null,
  summary: null,
  result: null,
  version: 0,
  reload: () => Promise.resolve(null),
  syncNow: () => Promise.resolve(),
});

export function BankSyncProvider({ refreshKey, children }) {
  const toast = useToast();
  // A new object on every toast; nothing here may depend on it.
  const toastRef = useRef(toast);
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState(null);
  const wasRunning = useRef(false);
  const resultTimer = useRef(null);

  const reload = useCallback(async () => {
    const next = await getBankSync();
    setStatus(next);
    return next;
  }, []);

  const finished = useCallback((added) => {
    setVersion((v) => v + 1);
    setResult({ added });
    clearTimeout(resultTimer.current);
    resultTimer.current = setTimeout(() => setResult(null), RESULT_MS);
  }, []);

  useEffect(() => () => clearTimeout(resultTimer.current), []);

  useEffect(() => {
    // A missing status is better than an error toast on every navigation.
    getBankSync()
      .then(setStatus)
      .catch(() => {});
  }, [refreshKey]);

  useOnVisible(() => {
    reload().catch(() => {});
  });

  // A sync someone else started (the schedule, another member): poll until
  // it ends, then let the pages reload.
  useEffect(() => {
    const running = Boolean(status?.running);
    if (wasRunning.current && !running) finished(null);
    wasRunning.current = running;
    if (!running) return undefined;
    const timer = setTimeout(() => reload().catch(() => {}), POLL_MS);
    return () => clearTimeout(timer);
  }, [status, reload, finished]);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const response = await runSync();
      if (response.running) {
        // Another sync holds the lock: show it running until it ends.
        await reload();
        return;
      }
      // This sync's own end, so polling doesn't count it a second time.
      wasRunning.current = false;
      await reload();
      finished(response.added);
    } catch (e) {
      toastRef.current.error(e.data?.detail ?? e.message);
    } finally {
      setSyncing(false);
    }
  }, [reload, finished]);

  const value = useMemo(() => {
    const shown = status && syncing ? { ...status, running: true } : status;
    return { status, summary: syncSummary(shown), result, version, reload, syncNow };
  }, [status, syncing, result, version, reload, syncNow]);

  return <BankSyncContext.Provider value={value}>{children}</BankSyncContext.Provider>;
}

export function useBankSync() {
  return useContext(BankSyncContext);
}

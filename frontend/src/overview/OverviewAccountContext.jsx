import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { listAccounts } from "../api/accounts";

// The account the overview (and the sidebar's balance) is about. The
// choice is remembered in this browser; a remembered account that is gone
// or archived falls back to the first active one. Layout provides it and
// reloads the accounts on every route change. See specs/overview.
const STORAGE_KEY = "reconciled.overviewAccount";

function readStored() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value == null ? null : Number(value);
  } catch {
    return null;
  }
}

function writeStored(id) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(id));
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
}

const OverviewAccountContext = createContext({
  accounts: [],
  account: null,
  loaded: false,
  setAccountId: () => {},
  refresh: () => {},
});

export function OverviewAccountProvider({ refreshKey, children }) {
  const [accounts, setAccounts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [chosenId, setChosenId] = useState(readStored);

  const refresh = useCallback(() => {
    listAccounts()
      .then((list) => setAccounts((list ?? []).filter((a) => !a.archived)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  const setAccountId = useCallback((id) => {
    setChosenId(id);
    writeStored(id);
  }, []);

  const account = accounts.find((a) => a.id === chosenId) ?? accounts[0] ?? null;

  return (
    <OverviewAccountContext.Provider value={{ accounts, account, loaded, setAccountId, refresh }}>
      {children}
    </OverviewAccountContext.Provider>
  );
}

export function useOverviewAccount() {
  return useContext(OverviewAccountContext);
}

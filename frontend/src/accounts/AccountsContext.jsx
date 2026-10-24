import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { listAccounts } from "../api/accounts";

// The active accounts, shared by the sidebar, the account pills, the
// overview and Import, plus the account last opened under Transactions
// (remembered in this browser). Layout provides it and reloads the
// accounts on every route change. See the transactions and ui-shell specs.
const STORAGE_KEY = "reconciled.lastAccount";

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

const AccountsContext = createContext({
  accounts: [],
  loaded: false,
  total: 0,
  lastOpenedId: null,
  defaultAccount: null,
  setLastOpened: () => {},
  refresh: () => {},
});

export function AccountsProvider({ refreshKey, children }) {
  const [accounts, setAccounts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [lastOpenedId, setLastOpenedId] = useState(readStored);

  const refresh = useCallback(() => {
    listAccounts()
      .then((list) => setAccounts((list ?? []).filter((a) => !a.archived)))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  const setLastOpened = useCallback((id) => {
    setLastOpenedId(id);
    writeStored(id);
  }, []);

  const total = accounts.reduce((sum, a) => sum + a.current_balance_cents, 0);
  // A remembered account that is gone or archived falls back to the first.
  const defaultAccount = accounts.find((a) => a.id === lastOpenedId) ?? accounts[0] ?? null;

  return (
    <AccountsContext.Provider value={{ accounts, loaded, total, lastOpenedId, defaultAccount, setLastOpened, refresh }}>
      {children}
    </AccountsContext.Provider>
  );
}

export function useAccounts() {
  return useContext(AccountsContext);
}

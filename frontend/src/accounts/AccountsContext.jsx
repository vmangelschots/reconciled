import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { listAccounts } from "../api/accounts";
import { onDataChanged } from "../lib/dataChanged";
import { useCoalescedRefresh } from "../lib/useCoalescedRefresh";
import { useOnVisible } from "../lib/useOnVisible";

// The active accounts, shared by the sidebar, the account pills, the
// overview and Import, plus the account last opened under Transactions
// (remembered in this browser). Layout provides it. The accounts reload on
// every route change, after any save the API client announces, and when the
// tab is shown again - see the transactions and ui-shell specs.
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
  everyday: null,
  lastOpenedId: null,
  defaultAccount: null,
  setLastOpened: () => {},
  refresh: () => {},
});

export function AccountsProvider({ refreshKey, children }) {
  const [accounts, setAccounts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [lastOpenedId, setLastOpenedId] = useState(readStored);

  // A failed reload keeps the accounts shown, without an error toast.
  const refresh = useCoalescedRefresh(
    listAccounts,
    (list) => setAccounts((list ?? []).filter((a) => !a.archived)),
    () => setLoaded(true),
  );

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);
  useEffect(() => onDataChanged(refresh), [refresh]);
  useOnVisible(refresh);

  const setLastOpened = useCallback((id) => {
    setLastOpenedId(id);
    writeStored(id);
  }, []);

  const total = accounts.reduce((sum, a) => sum + a.current_balance_cents, 0);
  // With accounts in more than one tier, the sidebar shows the everyday
  // money instead of the total - see the ui-shell spec.
  const tierOf = (a) => a.tier ?? "everyday";
  const everydayAccounts = accounts.filter((a) => tierOf(a) === "everyday");
  const everyday =
    new Set(accounts.map(tierOf)).size > 1
      ? {
          count: everydayAccounts.length,
          total: everydayAccounts.reduce((sum, a) => sum + a.current_balance_cents, 0),
        }
      : null;
  // A remembered account that is gone or archived falls back to the first.
  const defaultAccount = accounts.find((a) => a.id === lastOpenedId) ?? accounts[0] ?? null;

  return (
    <AccountsContext.Provider value={{ accounts, loaded, total, everyday, lastOpenedId, defaultAccount, setLastOpened, refresh }}>
      {children}
    </AccountsContext.Provider>
  );
}

export function useAccounts() {
  return useContext(AccountsContext);
}

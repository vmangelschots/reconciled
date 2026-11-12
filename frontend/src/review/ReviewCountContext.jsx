import { createContext, useContext, useEffect, useState } from "react";
import { getReviewCount } from "../api/transactions";
import { onDataChanged } from "../lib/dataChanged";
import { useCoalescedRefresh } from "../lib/useCoalescedRefresh";
import { useOnVisible } from "../lib/useOnVisible";

// How many transactions have a guessed category nobody confirmed yet, for
// the nav's Review pill. Layout provides it. It reloads on every route
// change, after any save the API client announces, and when the tab is shown
// again. See specs/auto-categorization and specs/ui-shell.
const ReviewCountContext = createContext({ count: 0, refresh: () => {} });

export function ReviewCountProvider({ refreshKey, children }) {
  const [count, setCount] = useState(0);

  // A failed reload keeps the pill as it is: better than an error toast on
  // every navigation.
  const refresh = useCoalescedRefresh(getReviewCount, (data) => setCount(data?.count ?? 0));

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);
  useEffect(() => onDataChanged(refresh), [refresh]);
  useOnVisible(refresh);

  return <ReviewCountContext.Provider value={{ count, refresh }}>{children}</ReviewCountContext.Provider>;
}

export function useReviewCount() {
  return useContext(ReviewCountContext);
}

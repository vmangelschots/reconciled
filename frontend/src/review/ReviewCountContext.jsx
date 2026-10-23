import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getReviewCount } from "../api/transactions";

// How many transactions have a guessed category nobody confirmed yet, for
// the nav's Review pill. Layout provides it and refreshes it on every route
// change; the Review page refreshes it after each confirm. See
// specs/auto-categorization.
const ReviewCountContext = createContext({ count: 0, refresh: () => {} });

export function ReviewCountProvider({ refreshKey, children }) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    getReviewCount()
      .then((data) => setCount(data?.count ?? 0))
      // A missing pill is better than an error toast on every navigation.
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  return <ReviewCountContext.Provider value={{ count, refresh }}>{children}</ReviewCountContext.Provider>;
}

export function useReviewCount() {
  return useContext(ReviewCountContext);
}

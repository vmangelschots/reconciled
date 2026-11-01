import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, ensureCsrfCookie, setActiveHousehold } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const me = await apiFetch("/api/auth/me/");
    setActiveHousehold(me.household?.id ?? null);
    setUser(me);
    return me;
  }, []);

  useEffect(() => {
    loadUser()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [loadUser]);

  const login = useCallback(async (username, password) => {
    await ensureCsrfCookie();
    await apiFetch("/api/auth/login/", {
      method: "POST",
      body: { username, password },
    });
    return loadUser();
  }, [loadUser]);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout/", { method: "POST" });
    setActiveHousehold(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

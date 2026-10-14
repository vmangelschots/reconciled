import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/accounts", label: "Accounts" },
  { to: "/transactions", label: "Transactions" },
  { to: "/budgets", label: "Budgets" },
  { to: "/import", label: "Import" },
  { to: "/forecast", label: "Forecast" },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app-layout">
      <header>
        <strong>reconciled</strong>
        <nav>
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="session">
          <span>{user?.username}</span>
          <button type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

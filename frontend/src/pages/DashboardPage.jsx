import { useAuth } from "../auth/AuthContext";

export function DashboardPage() {
  const { user } = useAuth();
  return (
    <section>
      <h1>Welcome, {user?.username}</h1>
      <p>Accounts, transactions, budgets, import, and forecast views land here as later tasks build them out.</p>
    </section>
  );
}

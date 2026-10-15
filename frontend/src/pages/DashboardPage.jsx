import { useAuth } from "../auth/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";

export function DashboardPage() {
  const { user } = useAuth();
  return (
    <section className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Welcome, {user?.username}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-secondary">
            Accounts, transactions, budgets, import, and forecast views are in the
            navigation above.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { AccountsPage } from "./pages/AccountsPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { ForecastingPage } from "./pages/ForecastingPage";
import { ImportPage } from "./pages/ImportPage";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ReviewPage } from "./pages/ReviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TabPage } from "./pages/TabPage";
import { TransactionsIndex, TransactionsPage } from "./pages/TransactionsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="transactions" element={<TransactionsIndex />} />
        <Route path="transactions/:accountId" element={<TransactionsPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="forecast" element={<ForecastingPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="tabs/:id" element={<TabPage />} />
      </Route>
    </Routes>
  );
}

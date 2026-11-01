import { useEffect, useRef } from "react";
import { Route, Routes } from "react-router-dom";
import { takeNotice } from "./api/client";
import { RequireAuth } from "./auth/RequireAuth";
import { Layout } from "./components/Layout";
import { useToast } from "./components/ui/Toast";
import { AccountsPage } from "./pages/AccountsPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { ForecastingPage } from "./pages/ForecastingPage";
import { ImportPage } from "./pages/ImportPage";
import { InvitePage } from "./pages/InvitePage";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReviewPage } from "./pages/ReviewPage";
import { BankRedirectPage } from "./pages/BankRedirectPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoanSchedulePage } from "./pages/LoanSchedulePage";
import { TabPage } from "./pages/TabPage";
import { TransactionsIndex, TransactionsPage } from "./pages/TransactionsPage";

export default function App() {
  const toast = useToast();
  const toastRef = useRef(toast);

  // A message from before a reload, such as a household changing in another tab.
  useEffect(() => {
    const notice = takeNotice();
    if (notice) toastRef.current.success(notice);
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
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
        <Route path="transactions/:accountId/schedule" element={<LoanSchedulePage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="budgets" element={<BudgetsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="forecast" element={<ForecastingPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/banks" element={<BankRedirectPage />} />
        <Route path="tabs/:id" element={<TabPage />} />
      </Route>
    </Routes>
  );
}

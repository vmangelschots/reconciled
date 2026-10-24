import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { getCashFlow, getCategorySpending } from "../api/reports";
import { listTabs } from "../api/tabs";
import { CategorySpendingChart } from "../components/CategorySpendingChart";
import { InOutChart } from "../components/InOutChart";
import { OpenTabsCard } from "../components/OpenTabsCard";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { useToast } from "../components/ui/Toast";

// Months are "YYYY-MM" strings in the browser's local time, so "the
// current month" is the user's, not the UTC server's.
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month, delta) {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(year, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month) {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1).toLocaleString(undefined, { month: "long", year: "numeric" });
}

function errorMessage(e) {
  return e.data ? Object.values(e.data).flat().join(" ") : e.message;
}

// Loads one report and tracks its own loading/error state, so a failure
// in one chart never blanks the other. Responses for a superseded
// request (e.g. a month the user already navigated past) are dropped.
function useReport(load, key) {
  const toast = useToast();
  const [state, setState] = useState({ data: null, error: null, loading: true });

  useEffect(() => {
    let current = true;
    setState((prev) => ({ ...prev, loading: true }));
    load()
      .then((data) => current && setState({ data, error: null, loading: false }))
      .catch((e) => {
        if (!current) return;
        setState({ data: null, error: e, loading: false });
        toast.error(errorMessage(e));
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

function ReportBody({ report, what, children }) {
  if (report.error) return <p className="text-sm text-critical">Couldn&apos;t load {what}.</p>;
  if (!report.data) return <p className="text-sm text-ink-secondary">Loading...</p>;
  return children(report.data);
}

export function DashboardPage() {
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const cashFlow = useReport(() => getCashFlow(thisMonth), thisMonth);
  const spending = useReport(() => getCategorySpending(month), month);
  const tabs = useReport(listTabs, "tabs");

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink-primary">Dashboard</h1>

      {/* Loading and failure show nothing: the card only matters once tabs exist. */}
      {tabs.data && <OpenTabsCard tabs={tabs.data} />}

      <Card>
        <CardHeader>
          <CardTitle>In vs out</CardTitle>
          <p className="text-sm text-ink-secondary">Last 12 months, all active accounts</p>
        </CardHeader>
        <CardContent>
          <ReportBody report={cashFlow} what="money in vs out">
            {(data) => <InOutChart months={data.months} />}
          </ReportBody>
          <p className="mt-3 text-xs text-ink-muted">Excludes transfers and tabs</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>Expenses per category</CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-32 text-center text-sm text-ink-primary">{monthLabel(month)}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next month"
              disabled={month >= thisMonth}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ReportBody report={spending} what="spending per category">
            {(data) => <CategorySpendingChart key={data.month} data={data} monthLabel={monthLabel(data.month)} />}
          </ReportBody>
        </CardContent>
      </Card>
    </section>
  );
}

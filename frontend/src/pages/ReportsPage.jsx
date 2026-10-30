import { Landmark, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccounts } from "../accounts/AccountsContext";
import { listCategories } from "../api/categories";
import { getSpendingReport } from "../api/reports";
import { InOutChart } from "../components/InOutChart";
import { SpendingChart } from "../components/SpendingChart";
import { SpendingSheet } from "../components/SpendingSheet";
import { SpendingTable } from "../components/SpendingTable";
import { buttonVariants } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { PillSwitch } from "../components/ui/PillSwitch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/Select";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useReport } from "../hooks/useReport";
import { cn } from "../lib/cn";
import { formatMoneyWhole } from "../lib/money";
import { currentMonth, monthLabel } from "../lib/months";
import {
  MAX_MONTHS,
  PERIOD_OPTIONS,
  monthChoices,
  monthCount,
  paramsForPeriod,
  periodFromParams,
} from "../lib/reportPeriod";
import { buildSeries } from "../lib/spendingReport";
import { assignableCategories } from "../lib/tabs";

const CHART_VIEWS = [
  { value: "spending", label: "Spending" },
  { value: "in-out", label: "In vs out" },
];

// A warning once this share of the period's spending has no category.
const UNCATEGORIZED_WARNING_SHARE = 0.1;

const whole = (cents) => formatMoneyWhole(cents);

function MonthSelect({ label, value, options, disabled, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-8 w-36 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {options.map((month) => (
          <SelectItem key={month} value={month} disabled={disabled(month)}>
            {monthLabel(month, { short: true })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// From and To, with the months that would break the period disabled.
function CustomPeriod({ period, onChange }) {
  const { start, end } = period;
  const options = monthChoices();
  const tooLong = (from, to) => monthCount(from, to) > MAX_MONTHS;
  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2 text-xs text-ink-muted">
      <span>From</span>
      <MonthSelect
        label="From"
        value={start}
        options={options}
        disabled={(m) => m > end || tooLong(m, end)}
        onChange={(month) => onChange({ start: month, end })}
      />
      <span>To</span>
      <MonthSelect
        label="To"
        value={end}
        options={options}
        disabled={(m) => m < start || tooLong(start, m)}
        onChange={(month) => onChange({ start, end: month })}
      />
    </div>
  );
}

function Summary({ report }) {
  const { spending, income, savings_rate: rate } = report;
  return (
    <p className="text-sm font-medium text-ink-primary">
      Spent {whole(spending.total_cents)} · Income {whole(income.total_cents)}
      {rate.total != null && ` · Saved ${rate.total}%`}
    </p>
  );
}

function UncategorizedWarning({ report }) {
  const cents = report.uncategorized?.total_cents ?? 0;
  const total = report.spending.total_cents;
  if (total <= 0 || cents / total <= UNCATEGORIZED_WARNING_SHARE) return null;
  return (
    <p className="text-sm text-warning">
      {whole(cents)} uncategorized ({Math.round((cents * 100) / total)}%) ·{" "}
      <Link to="/review" className="underline">
        Review
      </Link>
    </p>
  );
}

/**
 * Where the money went over a period: spending per month per category,
 * income and savings, and the rows behind each figure. See
 * specs/spending-report.
 */
export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const thisMonth = currentMonth();
  const period = periodFromParams(searchParams);
  const wide = useMediaQuery("(min-width: 1024px)");
  const { accounts, loaded } = useAccounts();
  const [custom, setCustom] = useState(false);
  const [view, setView] = useState("spending");
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState(null);
  const [hoverMonth, setHoverMonth] = useState(null);
  const [hoverSeries, setHoverSeries] = useState(null);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    listCategories().then((list) => setCategories(assignableCategories(list)));
  }, []);

  const main = useReport(
    () => getSpendingReport(period.start, period.end),
    `${period.start}/${period.end}/${version}`,
  );
  // A new user's default period is empty, so it shows the month so far.
  const firstWeeks = period.key === "12m" && main.data?.has_data && main.data.months.length === 0;
  const fallback = useReport(() => getSpendingReport(thisMonth, thisMonth), firstWeeks ? `first/${version}` : null);
  const shown = firstWeeks ? fallback : main;
  const report = shown.data?.months?.length > 0 ? shown.data : null;
  const series = useMemo(() => (report ? buildSeries(report) : []), [report]);

  const pickerKey = custom || period.key === "custom" ? "custom" : period.key;

  function pickPeriod(key) {
    setCustom(key === "custom");
    if (key !== "custom") setSearchParams(paramsForPeriod(key));
  }

  const noAccounts = loaded && accounts.length === 0;
  const noData = main.data && !main.data.has_data;
  const emptyPeriod = main.data?.has_data && main.data.months.length === 0 && !firstWeeks;

  const header = (
    <PageHeader title="Reports">
      {!noAccounts && !noData && (
        <PillSwitch label="Period" options={PERIOD_OPTIONS} value={pickerKey} onChange={pickPeriod} />
      )}
    </PageHeader>
  );

  if (noAccounts) {
    return (
      <section className="flex flex-col gap-6">
        {header}
        <Panel>
          <EmptyState
            icon={<Landmark className="h-6 w-6" />}
            action={
              <Link to="/accounts" className={buttonVariants()}>
                Go to Accounts
              </Link>
            }
          >
            There are no accounts yet.
          </EmptyState>
        </Panel>
      </section>
    );
  }

  if (noData) {
    return (
      <section className="flex flex-col gap-6">
        {header}
        <Panel>
          <EmptyState
            icon={<Upload className="h-6 w-6" />}
            action={
              <Link to="/import" className={buttonVariants()}>
                Go to Import
              </Link>
            }
          >
            There are no transactions to report on yet.
          </EmptyState>
        </Panel>
      </section>
    );
  }

  const loading = shown.loading && !shown.data;
  const error = shown.error ? "Couldn't load the report." : null;
  const stale = shown.loading && shown.data;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        {header}
        {pickerKey === "custom" && (
          <CustomPeriod
            period={period}
            onChange={(next) => setSearchParams(paramsForPeriod("custom", next))}
          />
        )}
        {report && (
          <>
            <p className="text-xs text-ink-muted">
              {monthLabel(report.months[0], { short: true })} –{" "}
              {monthLabel(report.months[report.months.length - 1], { short: true })} · All accounts · Excludes
              transfers and tabs
            </p>
            <Summary report={report} />
            <UncategorizedWarning report={report} />
            {firstWeeks && (
              <p className="text-sm text-ink-muted">This report is useful after your first full month.</p>
            )}
          </>
        )}
      </div>

      {emptyPeriod ? (
        <Panel>
          <EmptyState>No data in this period.</EmptyState>
        </Panel>
      ) : (
        <div className={cn("flex flex-col gap-4 transition-opacity", stale && "opacity-60")}>
          <Panel
            title={view === "spending" ? "Spending per month" : "In vs out"}
            loading={loading}
            error={error}
            actions={report && <PillSwitch label="Chart" options={CHART_VIEWS} value={view} onChange={setView} />}
          >
            {report &&
              (view === "spending" ? (
                <SpendingChart
                  key={`${report.months[0]}/${report.months.length}`}
                  report={report}
                  series={series}
                  highlight={hoverSeries}
                  onMonthHover={setHoverMonth}
                  onSelect={wide ? (s, month) => setSelection({ category: s.categoryId, month }) : undefined}
                />
              ) : (
                <InOutChart months={report.in_out} />
              ))}
          </Panel>
          {!error && (
            <Panel title="Profit and loss" flush loading={loading}>
              {report && (
                <SpendingTable
                  report={report}
                  series={series}
                  wide={wide}
                  hoverMonth={hoverMonth}
                  onHoverSeries={setHoverSeries}
                  onSelect={setSelection}
                />
              )}
            </Panel>
          )}
        </div>
      )}

      <SpendingSheet
        selection={selection}
        categories={categories}
        wide={wide}
        onClose={() => setSelection(null)}
        onChanged={() => setVersion((v) => v + 1)}
      />
    </section>
  );
}

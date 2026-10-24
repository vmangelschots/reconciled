import { AlertTriangle, CheckCircle2, HandCoins, Inbox, Landmark, Tag, Upload } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getOverview } from "../api/overview";
import { getCashFlow, getCategorySpending } from "../api/reports";
import { listTabs } from "../api/tabs";
import { CategorySpendingChart } from "../components/CategorySpendingChart";
import { InOutChart } from "../components/InOutChart";
import { OpenTabsCard } from "../components/OpenTabsCard";
import { Amount } from "../components/ui/Amount";
import { Button, buttonVariants } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ListRow } from "../components/ui/ListRow";
import { MonthSwitcher } from "../components/ui/MonthSwitcher";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/Select";
import { Stat } from "../components/ui/Stat";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useReport } from "../hooks/useReport";
import { cn } from "../lib/cn";
import { formatShortDate } from "../lib/dates";
import { formatMoneyWhole } from "../lib/money";
import { currentMonth, daysSince, monthLabel, monthName } from "../lib/months";
import { useOverviewAccount } from "../overview/OverviewAccountContext";

// The last import counts as stale after this many days - see the
// overview spec's "Stale import reminder".
const STALE_IMPORT_DAYS = 7;

const whole = (cents) => formatMoneyWhole(cents);

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function loadError(what) {
  return `Couldn't load ${what}.`;
}

function BalanceTile({ data, month, isCurrent }) {
  const change = data.in_out.in_cents - data.in_out.out_cents;
  const when = isCurrent ? "this month" : `in ${monthName(month)}`;
  return (
    <Stat label="Balance" note={isCurrent ? null : "Today"} value={whole(data.account.balance_cents)}>
      <span className={cn("text-sm", change > 0 ? "text-positive" : "text-ink-secondary")}>
        {formatMoneyWhole(change, { signed: true })} {when}
      </span>
    </Stat>
  );
}

function BudgetTile({ budget, allAccounts }) {
  const note = allAccounts ? "All accounts" : null;
  const extras = [
    budget.outside_cents > 0 && `+${whole(budget.outside_cents)} outside budgets`,
    budget.uncategorized_cents > 0 && `${whole(budget.uncategorized_cents)} uncategorized`,
  ].filter(Boolean);

  if (!budget.has_limits) {
    const spent = budget.spent_cents + budget.outside_cents + budget.uncategorized_cents;
    return (
      <Stat label="Spent" note={note} value={whole(spent)}>
        <Link to="/budgets" className="text-sm text-accent hover:underline">
          Set budgets →
        </Link>
      </Stat>
    );
  }

  const left = budget.limit_cents - budget.spent_cents;
  const perDay =
    left > 0 && budget.days_left ? Math.floor(left / 100 / budget.days_left) * 100 : null;
  return (
    <Stat
      label="Budget"
      note={note}
      value={
        <>
          {whole(budget.spent_cents)}
          <span className="text-base font-normal text-ink-muted"> of {whole(budget.limit_cents)}</span>
        </>
      }
    >
      <ProgressBar
        className="my-2"
        label="Budget spent"
        value={budget.spent_cents}
        max={budget.limit_cents}
        marker={budget.pace}
      />
      <span className={cn("text-sm", left < 0 ? "text-critical" : "text-ink-secondary")}>
        {left < 0 ? `${whole(-left)} over` : `${whole(left)} left`}
        {perDay != null && ` · ${whole(perDay)} a day`}
      </span>
      {extras.length > 0 && <span className="text-xs text-ink-muted">{extras.join(" · ")}</span>}
    </Stat>
  );
}

function ForecastTile({ forecast, isCurrent }) {
  if (!forecast.has_recurring) {
    return (
      <Stat label="Forecast" note={isCurrent ? null : "From today"} value={whole(forecast.low_cents)}>
        <span className="text-sm text-ink-secondary">No recurring transactions yet.</span>
        <Link to="/forecast" className="text-sm text-accent hover:underline">
          Add them →
        </Link>
      </Stat>
    );
  }
  return (
    <Stat
      label="Low point, next 90 days"
      note={isCurrent ? null : "From today"}
      value={whole(forecast.low_cents)}
      tone={forecast.low_cents < 0 ? "critical" : "default"}
    >
      <span className="text-sm text-ink-secondary">on {formatShortDate(forecast.low_date)}</span>
      {forecast.next && (
        <span className="text-xs text-ink-muted">
          Next: {forecast.next.payee} {formatMoneyWhole(forecast.next.amount_cents, { signed: true })} ·{" "}
          {formatShortDate(forecast.next.date)}
        </span>
      )}
    </Stat>
  );
}

function attentionItems(data, month, isCurrent) {
  const { attention, budget, account } = data;
  const items = [];
  if (attention.review_count > 0) {
    items.push({
      key: "review",
      to: "/review",
      icon: <Inbox className="h-4 w-4" />,
      primary: plural(attention.review_count, "guess to review", "guesses to review"),
    });
  }
  if (attention.uncategorized_count > 0) {
    const when = isCurrent ? "this month" : `in ${monthName(month)}`;
    items.push({
      key: "uncategorized",
      to: "/review",
      icon: <Tag className="h-4 w-4" />,
      primary:
        `${attention.uncategorized_count} uncategorized` +
        (budget.uncategorized_cents > 0 ? ` (${whole(budget.uncategorized_cents)} ${when})` : ""),
    });
  }
  for (const c of attention.categories) {
    items.push({
      key: `category-${c.id}`,
      to: `/budgets?month=${month}`,
      icon: <AlertTriangle className={cn("h-4 w-4", c.over ? "text-critical" : "text-warning")} />,
      primary: c.over ? `${c.name} ${whole(c.spent_cents - c.limit_cents)} over` : `${c.name} at ${c.share}%`,
      secondary: `${c.parent_name ? `${c.parent_name} · ` : ""}${whole(c.spent_cents)} of ${whole(c.limit_cents)}`,
      tone: c.over ? "text-critical" : undefined,
    });
  }
  const daysAgo = account.last_import_date ? daysSince(account.last_import_date) : null;
  if (daysAgo == null || daysAgo > STALE_IMPORT_DAYS) {
    items.push({
      key: "import",
      to: "/import",
      icon: <Upload className="h-4 w-4" />,
      primary: daysAgo == null ? "No imports yet" : `Last import ${daysAgo} days ago`,
    });
  }
  return items;
}

function NeedsAttention({ data, month, isCurrent }) {
  const items = attentionItems(data, month, isCurrent);
  if (items.length === 0) {
    return (
      <EmptyState compact className="px-5 pb-4" icon={<CheckCircle2 className="h-4 w-4 text-positive" />}>
        Everything is in order.
      </EmptyState>
    );
  }
  return (
    <ul className="flex flex-col pb-2">
      {items.map(({ key, ...item }) => (
        <ListRow key={key} {...item} />
      ))}
    </ul>
  );
}

function recentLabel(row) {
  if (row.transfer_account_name) return `${row.amount_cents < 0 ? "→" : "←"} ${row.transfer_account_name}`;
  if (row.part_count > 0) return `Split · ${row.part_count}`;
  return row.category_label ?? "Uncategorized";
}

function RecentTransactions({ rows }) {
  if (rows.length === 0) {
    return <EmptyState className="pb-4">No transactions yet.</EmptyState>;
  }
  return (
    <ul className="flex flex-col pb-2">
      {rows.map((row) => (
        <ListRow
          key={row.id}
          icon={row.is_tab ? <HandCoins className="h-4 w-4" /> : null}
          primary={row.payee}
          secondary={`${formatShortDate(row.date)} · ${recentLabel(row)}`}
          end={<Amount cents={row.amount_cents} signed />}
        />
      ))}
    </ul>
  );
}

function TableToggle({ shown, onToggle }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onToggle}>
      {shown ? "Hide table" : "Show as table"}
    </Button>
  );
}

/**
 * The home page: how one account is doing in one month, and what needs
 * attention. Each panel loads and fails on its own. See specs/overview.
 */
export function OverviewPage() {
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const isCurrent = month === thisMonth;
  const isWide = useMediaQuery("(min-width: 640px)");
  const { accounts, account, loaded, setAccountId } = useOverviewAccount();
  const [categoryTable, setCategoryTable] = useState(false);
  const [inOutTable, setInOutTable] = useState(false);

  const accountId = account?.id ?? null;
  const overview = useReport(
    () => getOverview(month, accountId),
    accountId == null ? null : `${month}:${accountId}`,
  );
  const spending = useReport(() => getCategorySpending(month), month);
  const cashFlow = useReport(() => getCashFlow(month), month);
  const tabs = useReport(listTabs, "tabs");

  const header = (
    <PageHeader
      title="Overview"
      actions={
        <Link to="/import" className={buttonVariants({ variant: "outline" })}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          Import
        </Link>
      }
    >
      <MonthSwitcher month={month} onChange={setMonth} short={!isWide} />
      {accounts.length > 1 && (
        <Select value={accountId != null ? String(accountId) : ""} onValueChange={(v) => setAccountId(Number(v))}>
          <SelectTrigger className="min-w-0 flex-1 sm:w-48 sm:flex-none" aria-label="Account">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </PageHeader>
  );

  if (loaded && accounts.length === 0) {
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

  const data = overview.data;
  const overviewError = overview.error ? loadError("the overview") : null;
  const tileLoading = !data && !overviewError;
  const hasTabs = tabs.data && tabs.data.length > 0;

  return (
    <section className="flex flex-col gap-6">
      {header}

      <div className="grid gap-4 md:grid-cols-3">
        <Panel aria-label="Balance" loading={tileLoading} error={overviewError}>
          {data && <BalanceTile data={data} month={month} isCurrent={isCurrent} />}
        </Panel>
        <Panel aria-label="Budget" loading={tileLoading} error={overviewError}>
          {data && <BudgetTile budget={data.budget} allAccounts={accounts.length > 1} />}
        </Panel>
        <Panel aria-label="Forecast" loading={tileLoading} error={overviewError}>
          {data && <ForecastTile forecast={data.forecast} isCurrent={isCurrent} />}
        </Panel>
      </div>

      {/* DOM order is the phone order; on wide screens the side column
          (attention, tabs) moves to the right of the main one. */}
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-4 lg:col-start-3 lg:row-start-1">
          <Panel title="Needs attention" flush loading={tileLoading} error={overviewError}>
            {data && <NeedsAttention data={data} month={month} isCurrent={isCurrent} />}
          </Panel>
          {hasTabs && (
            <Panel title="Open tabs" flush>
              <OpenTabsCard tabs={tabs.data} compact />
            </Panel>
          )}
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <Panel
            title="Spending by category"
            loading={spending.loading && !spending.data}
            error={spending.error ? loadError("spending per category") : null}
            actions={spending.data && <TableToggle shown={categoryTable} onToggle={() => setCategoryTable((v) => !v)} />}
          >
            {spending.data && (
              <CategorySpendingChart
                key={spending.data.month}
                data={spending.data}
                monthLabel={monthLabel(spending.data.month)}
                showTable={categoryTable}
              />
            )}
          </Panel>
          <Panel
            title="Recent transactions"
            flush
            loading={tileLoading}
            error={overviewError}
            actions={
              <Link to="/transactions" className="text-accent hover:underline">
                View all →
              </Link>
            }
          >
            {data && <RecentTransactions rows={data.recent} />}
          </Panel>
        </div>
      </div>

      <Panel
        title="In vs out"
        loading={cashFlow.loading && !cashFlow.data}
        error={cashFlow.error ? loadError("money in vs out") : null}
        actions={cashFlow.data && <TableToggle shown={inOutTable} onToggle={() => setInOutTable((v) => !v)} />}
      >
        <p className="-mt-2 mb-3 text-xs text-ink-muted">
          12 months to {monthLabel(month)} · All active accounts · Excludes transfers and tabs
        </p>
        {cashFlow.data && <InOutChart months={cashFlow.data.months} showTable={inOutTable} />}
      </Panel>
    </section>
  );
}

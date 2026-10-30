import {
  AlertTriangle,
  CalendarClock,
  ChartBarDecreasing,
  ChartPie,
  CheckCircle2,
  HandCoins,
  Inbox,
  Landmark,
  Tag,
  Upload,
} from "lucide-react";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { getOverview } from "../api/overview";
import { getCategorySpending, getEverydayBalance, getNetWorth } from "../api/reports";
import { listTabs } from "../api/tabs";
import { CategorySpendingChart } from "../components/CategorySpendingChart";
import { CategorySpendingPie } from "../components/CategorySpendingPie";
import { EverydayMoneyChart } from "../components/EverydayMoneyChart";
import { NetWorthPanel } from "../components/NetWorthChart";
import { OpenTabsCard } from "../components/OpenTabsCard";
import { Amount } from "../components/ui/Amount";
import { Button, buttonVariants } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ListRow } from "../components/ui/ListRow";
import { MonthSwitcher } from "../components/ui/MonthSwitcher";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { PillSwitch } from "../components/ui/PillSwitch";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Stat } from "../components/ui/Stat";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useReport } from "../hooks/useReport";
import { cn } from "../lib/cn";
import { formatShortDate } from "../lib/dates";
import { freshness, plural, staleImports } from "../lib/importFreshness";
import { formatMoney, formatMoneyWhole } from "../lib/money";
import { currentMonth, daysSince, monthLabel, monthName } from "../lib/months";
import { formatDayMonth } from "../lib/yearlyBudgets";
import { VALUED_TYPES, tierLabel } from "../lib/tiers";
import { useAccounts } from "../accounts/AccountsContext";

// Which view "Spending by category" opens in, remembered per browser.
const CATEGORY_CHART_KEY = "reconciled-category-chart"; // "bars" | "pie"

function getStoredCategoryChart() {
  try {
    return window.localStorage.getItem(CATEGORY_CHART_KEY) === "pie" ? "pie" : "bars";
  } catch {
    return "bars";
  }
}

function storeCategoryChart(view) {
  try {
    window.localStorage.setItem(CATEGORY_CHART_KEY, view);
  } catch {
    // Private windows can refuse storage; the choice just isn't remembered.
  }
}

const whole = (cents) => formatMoneyWhole(cents);

// With accounts in more than one tier, the overview leads with Everyday.
const spansTiers = (data) => (data.tiers ?? []).length > 1;

function loadError(what) {
  return `Couldn't load ${what}.`;
}

// With accounts in more than one tier, the headline is the everyday money
// and the other tiers and net worth sit under it - see the overview spec's
// "Everyday money and net worth". Debt keeps the normal ink.
function BalanceTile({ data, month, isCurrent }) {
  const change = data.in_out.in_cents - data.in_out.out_cents;
  const when = isCurrent ? "this month" : `in ${monthName(month)}`;
  const others = (data.tiers ?? []).filter((t) => t.tier !== "everyday");
  const split = spansTiers(data);
  const worthChange = data.net_worth_change_cents;
  return (
    <div className="flex flex-col gap-3">
      <Stat
        label={split ? "Everyday" : "Balance"}
        note={isCurrent ? null : "Today"}
        value={whole(split ? data.everyday_cents : data.balance_cents)}
      >
        <span className={cn("text-sm", change > 0 ? "text-positive" : "text-ink-secondary")}>
          {formatMoneyWhole(change, { signed: true })} {when}
        </span>
      </Stat>
      {split && (
        <dl className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
          {others.map((t) => (
            <div key={t.tier} className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-secondary">{tierLabel(t.tier)}</dt>
              <dd className="num text-ink-primary">{whole(t.balance_cents)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-medium text-ink-primary">Net worth</dt>
            <dd className="num font-medium text-ink-primary">{whole(data.balance_cents)}</dd>
          </div>
          {worthChange != null && worthChange !== 0 && (
            <div className={cn("num text-right text-xs", worthChange > 0 ? "text-positive" : "text-ink-secondary")}>
              {formatMoneyWhole(worthChange, { signed: true })} {when}
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

function BudgetTile({ budget }) {
  const yearlySpent = budget.yearly_spent_cents ?? 0;
  const extras = [
    yearlySpent > 0 && `${whole(yearlySpent)} on yearly budgets`,
    budget.outside_cents > 0 && `+${whole(budget.outside_cents)} outside budgets`,
    budget.uncategorized_cents > 0 && `${whole(budget.uncategorized_cents)} uncategorized`,
  ].filter(Boolean);

  if (!budget.has_limits) {
    const spent = budget.spent_cents + budget.outside_cents + budget.uncategorized_cents + yearlySpent;
    return (
      <Stat label="Spent" value={whole(spent)}>
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
      {extras.length > 0 && (
        // Each piece stays on one line, so the line only breaks between them.
        <span className="flex flex-wrap gap-x-1 text-xs text-ink-muted">
          {extras.map((extra, i) => (
            <Fragment key={extra}>
              {i > 0 && " "}
              <span className="whitespace-nowrap">{i > 0 ? `· ${extra}` : extra}</span>
            </Fragment>
          ))}
        </span>
      )}
    </Stat>
  );
}

// How fresh an account's data is: stale after STALE_IMPORT_DAYS, or when
// it was never imported. An account whose value is set by hand is never
// stale; it says when its value was last set instead.
function accountFreshness(account) {
  if (VALUED_TYPES.has(account.account_type)) {
    const text = account.last_value_date ? `value set ${formatDayMonth(account.last_value_date)}` : "No value set";
    return { text, stale: false, days: 0 };
  }
  return freshness(account.last_import_date);
}

function AccountsTile({ accounts }) {
  return (
    <ul className="-mx-5 -mb-2 flex flex-col">
      {accounts.map((a) => {
        const fresh = accountFreshness(a);
        return (
          <ListRow
            key={a.id}
            to={`/transactions/${a.id}`}
            primary={<span title={a.name}>{a.name}</span>}
            secondary={<span className={cn(fresh.stale && "text-warning")}>{fresh.text}</span>}
            end={<span className="num font-medium text-ink-primary">{whole(a.balance_cents)}</span>}
          />
        );
      })}
    </ul>
  );
}

// One line for every stale account, opening Import on the stalest. See the
// overview spec.
function staleImportItem(accounts) {
  const stale = staleImports(accounts);
  if (!stale) return null;
  return {
    key: "import",
    to: `/import?account=${stale.stalest.id}`,
    icon: <Upload className="h-4 w-4" />,
    primary: stale.text,
  };
}

function attentionItems(data, month, isCurrent) {
  const { attention, budget } = data;
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
  for (const y of attention.yearly ?? []) items.push(yearlyItem(y, month));
  for (const loan of attention.missed_loans ?? []) items.push(missedLoanItem(loan));
  const stale = staleImportItem(data.accounts);
  if (stale) items.push(stale);
  return items;
}

// A loan installment whose payment wasn't seen - see specs/overview,
// "Missed loan payments". The second line tells two loans paid from one
// account apart.
function missedLoanItem(loan) {
  return {
    key: `loan-${loan.account_id}`,
    to: `/transactions/${loan.account_id}/schedule?installment=${loan.installment}`,
    icon: <AlertTriangle className="h-4 w-4 text-warning" />,
    primary: `${loan.name}: payment of ${formatDayMonth(loan.date)} not seen`,
    secondary: `Installment ${loan.installment} of ${loan.term_months} · ${formatMoney(loan.payment_cents)} from ${loan.paid_from_name}`,
  };
}

// A yearly budget or target that needs attention - see specs/overview,
// "Yearly warnings".
function yearlyItem(y, month) {
  const over = y.spent_cents - y.budget_cents;
  const daysLeft = y.due_date ? -daysSince(y.due_date) : null;
  const primary = {
    over: `${y.name} ${whole(over)} over`,
    ahead: `${y.name} at ${y.share}% of ${month.slice(0, 4)}`,
    due_soon: `${y.name} due ${daysLeft === 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`}`,
    not_seen: `${y.name} not seen yet`,
    overdue: `${y.name} overdue`,
    partly_paid: `${y.name} ${whole(-over)} short`,
  }[y.state];
  const figures =
    y.kind === "target"
      ? `Due ${formatDayMonth(y.due_date)} · ${whole(y.spent_cents)} of ${whole(y.budget_cents)}`
      : `Yearly · ${whole(y.spent_cents)} of ${whole(y.budget_cents)}`;
  const critical = y.state === "over" || y.state === "overdue";
  return {
    key: `yearly-${y.id}`,
    to: `/budgets?month=${month}`,
    icon:
      y.state === "due_soon" ? (
        <CalendarClock className="h-4 w-4 text-ink-muted" />
      ) : (
        <AlertTriangle className={cn("h-4 w-4", critical ? "text-critical" : "text-warning")} />
      ),
    primary,
    secondary: `${y.parent_name ? `${y.parent_name} · ` : ""}${figures}`,
    tone: critical ? "text-critical" : undefined,
  };
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
  if (row.transfer_account_name) return "Transfer";
  if (row.part_count > 0) return `Split · ${row.part_count}`;
  return row.category_label ?? "Uncategorized";
}

// A transfer between the user's accounts reads "<from> → <to>" with the
// amount moved; otherwise the payee and its signed amount. With several
// accounts, the account name sits under the amount.
function RecentTransactions({ rows, showAccounts }) {
  if (rows.length === 0) {
    return <EmptyState className="pb-4">No transactions yet.</EmptyState>;
  }
  return (
    <ul className="flex flex-col pb-2">
      {rows.map((row) => (
        <ListRow
          key={row.id}
          icon={row.is_tab ? <HandCoins className="h-4 w-4" /> : null}
          primary={
            row.transfer_account_name
              ? row.amount_cents < 0
                ? `${row.account_name} → ${row.transfer_account_name}`
                : `${row.transfer_account_name} → ${row.account_name}`
              : row.payee
          }
          secondary={`${formatShortDate(row.date)} · ${recentLabel(row)}`}
          end={
            <span className="flex flex-col items-end">
              {row.transfer_account_name ? (
                <Amount cents={Math.abs(row.amount_cents)} />
              ) : (
                <Amount cents={row.amount_cents} signed />
              )}
              {showAccounts && !row.transfer_account_name && (
                <span className="max-w-28 truncate text-xs text-ink-muted">{row.account_name}</span>
              )}
            </span>
          }
        />
      ))}
    </ul>
  );
}

function TableToggle({ shown, onToggle, short = false }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onToggle} aria-pressed={short ? shown : undefined}>
      {short ? "Table" : shown ? "Hide table" : "Show as table"}
    </Button>
  );
}

const CATEGORY_VIEWS = [
  { value: "bars", label: "Bars", Icon: ChartBarDecreasing },
  { value: "pie", label: "Pie", Icon: ChartPie },
];

/**
 * The home page: how all accounts together are doing in one month, and
 * what needs attention. Each panel loads and fails on its own. See specs/overview.
 */
export function OverviewPage() {
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const isCurrent = month === thisMonth;
  const isWide = useMediaQuery("(min-width: 640px)");
  const isLarge = useMediaQuery("(min-width: 1024px)");
  const { accounts, loaded } = useAccounts();
  const [categoryTable, setCategoryTable] = useState(false);
  const [categoryView, setCategoryView] = useState(getStoredCategoryChart);
  const [everydayTable, setEverydayTable] = useState(false);

  const overview = useReport(() => getOverview(month), loaded && accounts.length > 0 ? month : null);
  const spending = useReport(() => getCategorySpending(month), month);
  const everyday = useReport(() => getEverydayBalance(month), month);
  const netWorth = useReport(getNetWorth, "net-worth");
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
  const netWorthPanel = (
    <NetWorthPanel
      months={netWorth.data?.months}
      loading={netWorth.loading && !netWorth.data}
      error={netWorth.error ? loadError("net worth") : null}
      selectedMonth={month}
      sideColumn={isLarge}
    />
  );

  return (
    <section className="flex flex-col gap-6">
      {header}

      <div className="grid gap-4 md:grid-cols-3">
        <Panel aria-label="Balance summary" loading={tileLoading} error={overviewError}>
          {data && <BalanceTile data={data} month={month} isCurrent={isCurrent} />}
        </Panel>
        <Panel aria-label="Budget" loading={tileLoading} error={overviewError}>
          {data && <BudgetTile budget={data.budget} />}
        </Panel>
        <Panel aria-label="Accounts" loading={tileLoading} error={overviewError}>
          {data && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">Accounts</span>
              <AccountsTile accounts={data.accounts} />
            </div>
          )}
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
          {isLarge && netWorthPanel}
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <Panel
            title={data && !spansTiers(data) ? "Balance" : "Everyday"}
            loading={everyday.loading && !everyday.data}
            error={everyday.error ? loadError("the everyday balance") : null}
            actions={
              everyday.data && (
                <TableToggle shown={everydayTable} onToggle={() => setEverydayTable((v) => !v)} short={!isWide} />
              )
            }
          >
            {everyday.data && (
              <EverydayMoneyChart
                data={everyday.data}
                accounts={data?.accounts}
                showTable={everydayTable}
              />
            )}
          </Panel>
          <Panel
            title="Spending by category"
            loading={spending.loading && !spending.data}
            error={spending.error ? loadError("spending per category") : null}
            actions={
              spending.data && (
                <>
                  <PillSwitch
                    label="Chart view"
                    options={CATEGORY_VIEWS}
                    value={categoryView}
                    onChange={(view) => {
                      setCategoryView(view);
                      storeCategoryChart(view);
                    }}
                  />
                  <TableToggle shown={categoryTable} onToggle={() => setCategoryTable((v) => !v)} short={!isWide} />
                </>
              )
            }
          >
            {spending.data &&
              (categoryView === "pie" ? (
                <CategorySpendingPie
                  key={spending.data.month}
                  data={spending.data}
                  monthLabel={monthLabel(spending.data.month)}
                  showTable={categoryTable}
                />
              ) : (
                <CategorySpendingChart
                  key={spending.data.month}
                  data={spending.data}
                  monthLabel={monthLabel(spending.data.month)}
                  showTable={categoryTable}
                />
              ))}
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
            {data && <RecentTransactions rows={data.recent} showAccounts={data.accounts.length > 1} />}
          </Panel>
          {!isLarge && netWorthPanel}
        </div>
      </div>
    </section>
  );
}

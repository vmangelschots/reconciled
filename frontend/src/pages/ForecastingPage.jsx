import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Info } from "lucide-react";
import {
  createExpectedItem,
  deleteExpectedItem,
  getExpectedItemOptions,
  getForecast,
  getNetWorthForecast,
  listExpectedItems,
  updateExpectedItem,
} from "../api/forecasting";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { ForecastChart, longDay } from "../components/ForecastChart";
import { NetWorthForecastChart } from "../components/NetWorthForecastChart";
import { Amount } from "../components/ui/Amount";
import { Button } from "../components/ui/Button";
import { DialogTitle } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { PillSwitch } from "../components/ui/PillSwitch";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Sheet } from "../components/ui/Sheet";
import { Stat } from "../components/ui/Stat";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useToast } from "../components/ui/Toast";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { cn } from "../lib/cn";
import { todayIso } from "../lib/dates";
import { staleImports } from "../lib/importFreshness";
import { formatMoneyWhole, parseCents } from "../lib/money";
import { formatDayMonth } from "../lib/yearlyBudgets";

const HORIZONS = [
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

const VIEWS = [
  { value: "everyday", label: "Everyday" },
  { value: "net-worth", label: "Net worth" },
];

const YEARS = [
  { value: 1, label: "1 year" },
  { value: 3, label: "3 years" },
  { value: 5, label: "5 years" },
];

const yearsText = (years) => (years === 1 ? "1 year" : `${years} years`);

const whole = (cents) => formatMoneyWhole(cents);

function errorText(e) {
  return e.data ? Object.values(e.data).flat().join(" ") : e.message;
}

/**
 * The forecast: the Everyday money over 30 or 90 days, or net worth over 1,
 * 3 or 5 years, from bills, loans, budgets and expected items - see
 * openspec/specs/forecasting. The view and horizon live in the address.
 */
export function ForecastingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") === "net-worth" ? "net-worth" : "everyday";
  const days = Number(searchParams.get("days")) === 30 ? 30 : 90;
  const years = [3, 5].includes(Number(searchParams.get("years"))) ? Number(searchParams.get("years")) : 1;
  const netWorth = view === "net-worth";
  const key = netWorth ? `net-worth-${years}` : `everyday-${days}`;
  // Tagged with what it was loaded for, so a switch never shows the other
  // view's data, nor a late answer for an earlier choice.
  const [loaded, setLoaded] = useState(null);
  const forecast = loaded?.key === key ? loaded.data : null;
  const latestKey = useRef(key);
  latestKey.current = key;
  const [expected, setExpected] = useState(null);
  const [options, setOptions] = useState({ categories: [], accounts: [] });
  const [error, setError] = useState(null);
  // null when closed; otherwise { item } to edit, or { direction } to add.
  const [sheet, setSheet] = useState(null);
  const isWide = useMediaQuery("(min-width: 640px)");

  function load() {
    const loadForecast = netWorth ? getNetWorthForecast(years) : getForecast(days);
    const loadingKey = key;
    return Promise.all([loadForecast, listExpectedItems(), getExpectedItemOptions()])
      .then(([f, items, opts]) => {
        if (loadingKey === latestKey.current) setLoaded({ key: loadingKey, data: f });
        setExpected(items);
        setOptions(opts);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Switching views drops the other view's horizon.
  const address = (next) => setSearchParams(next, { replace: true });
  const setView = (next) => address(next === "net-worth" ? { view: next } : {});
  const setDays = (value) => address(value === 90 ? {} : { days: String(value) });
  const setYears = (value) => address(value === 1 ? { view: "net-worth" } : { view: "net-worth", years: String(value) });

  const loading = !forecast && !error;
  const openExpected = (id) => setSheet({ item: expected.find((i) => i.id === id) });
  const addIncome = () => setSheet({ direction: "in" });

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title="Forecast">
        <PillSwitch label="View" options={VIEWS} value={view} onChange={setView} />
        {netWorth ? (
          <PillSwitch label="Horizon" options={YEARS} value={years} onChange={setYears} />
        ) : (
          <PillSwitch label="Horizon" options={HORIZONS} value={days} onChange={setDays} />
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Panel loading={loading} error={error} className="lg:col-span-2">
          {forecast &&
            expected &&
            (netWorth ? (
              <NetWorthSummary forecast={forecast} years={years} hasExpected={expected.length > 0} onAddIncome={addIncome} />
            ) : (
              <ForecastSummary forecast={forecast} hasExpected={expected.length > 0} onAddIncome={addIncome} />
            ))}
        </Panel>
        <ExpectedPanel
          items={expected}
          loading={loading}
          onAdd={() => setSheet({ direction: "out" })}
          onAddIncome={addIncome}
          onOpen={openExpected}
          className="lg:col-start-3 lg:row-start-1"
        />
        {forecast && !netWorth && <ComingUp forecast={forecast} onOpenExpected={openExpected} className="lg:col-span-2" />}
      </div>

      <ExpectedSheet
        key={sheet ? (sheet.item?.id ?? `new-${sheet.direction}`) : "closed"}
        sheet={sheet}
        options={options}
        wide={isWide}
        onClose={() => setSheet(null)}
        onSaved={() => {
          setSheet(null);
          load();
        }}
      />
    </section>
  );
}

function ForecastSummary({ forecast, hasExpected, onAddIncome }) {
  const { points, lowest, items, missed, has_income: hasIncome, horizon_days: horizonDays } = forecast;
  const today = points[0];
  const end = points[points.length - 1];
  const nothing = items.length === 0;
  const stale = staleImports(forecast.accounts ?? [])?.text;
  const lowCritical = hasIncome && lowest && lowest.balance_cents < 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Today" size="sm" value={whole(today.balance_cents)} detail={longDay(today.date)} />
        {nothing ? (
          <span />
        ) : (
          <Stat
            label="Lowest"
            size="sm"
            value={whole(lowest.balance_cents)}
            detail={formatDayMonth(lowest.date)}
            tone={lowCritical ? "critical" : "default"}
          />
        )}
        <Stat label={`In ${horizonDays} days`} size="sm" value={whole(end.balance_cents)} detail={formatDayMonth(end.date)} />
      </div>
      <div className="flex flex-col gap-1 text-xs text-ink-muted">
        <span>Bills, loans, budgets and expected items. Spending without a budget isn&apos;t included.</span>
        {stale && <span className="text-warning">{stale}</span>}
      </div>
      {!hasIncome && hasExpected && <NoIncomeNote onAddIncome={onAddIncome} />}
      {nothing && missed.length === 0 ? (
        <EmptyState>Nothing expected in the next {horizonDays} days.</EmptyState>
      ) : (
        <ForecastChart points={points} items={items} lowest={lowest} critical={hasIncome} />
      )}
    </div>
  );
}

function NoIncomeNote({ onAddIncome }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-ink-secondary">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      <p>
        Only money going out is counted. Add your salary to see the whole picture.{" "}
        <button type="button" onClick={onAddIncome} className="text-accent hover:underline">
          Add expected income
        </button>
      </p>
    </div>
  );
}

function shortMonthYear(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function NetWorthSummary({ forecast, years, hasExpected, onAddIncome }) {
  const { months, start_cents: start, has_income: hasIncome, empty } = forecast;
  const end = months[months.length - 1];
  const stale = staleImports(forecast.accounts ?? [])?.text;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Today" size="sm" value={whole(start)} detail={longDay(todayIso())} />
        {empty ? (
          <span />
        ) : (
          <Stat label="Change" size="sm" value={formatMoneyWhole(end.total_cents - start, { signed: true })} />
        )}
        <Stat
          label={`In ${yearsText(years)}`}
          size="sm"
          value={whole(end.total_cents)}
          detail={shortMonthYear(end.month)}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-ink-muted">
        <span>
          Bills, loans, budgets and expected items. Loans count their interest; moving money between your accounts,
          investments and property don&apos;t change it.
        </span>
        {stale && <span className="text-warning">{stale}</span>}
      </div>
      {!hasIncome && hasExpected && <NoIncomeNote onAddIncome={onAddIncome} />}
      {empty ? (
        <EmptyState>Nothing expected in the next {years === 1 ? "year" : yearsText(years)}.</EmptyState>
      ) : (
        <NetWorthForecastChart months={months} />
      )}
    </div>
  );
}

const budgetMonth = (link) => link.month.slice(0, 7);

function itemTarget(item) {
  const { link, source } = item;
  if (source === "installment") return `/transactions/${link.account}/schedule?installment=${link.installment}`;
  if (source === "expected") return null;
  return `/budgets?month=${budgetMonth(link)}&category=${link.category}`;
}

function itemCaption(item, missed) {
  const { source, detail, late_since: lateSince } = item;
  let caption;
  if (source === "bill") caption = `Bill · ${detail.category}`;
  else if (source === "installment") caption = `Loan · installment ${detail.number} of ${detail.of}`;
  else if (source === "target") caption = `Yearly · due ${formatDayMonth(detail.due)}`;
  else if (source === "budget") {
    const kind = detail.kind === "yearly" ? "Yearly budget" : "Budget";
    caption = `${kind} · ${whole(detail.total_cents)} left, spread to ${formatDayMonth(detail.until)}`;
  } else caption = `Expected · ${detail.category ?? `→ ${detail.account}`}`;
  if (missed) return "Missed · not counted";
  if (lateSince) return `${caption} · due ${formatDayMonth(lateSince)}`;
  return caption;
}

function ComingUp({ forecast, onOpenExpected, className }) {
  const balances = new Map(forecast.points.map((p) => [p.date, p.balance_cents]));
  const days = new Map();
  const add = (date, entry) => days.set(date, [...(days.get(date) ?? []), entry]);
  forecast.missed.forEach((item) => add(item.date, { item, missed: true }));
  forecast.items.forEach((item) => add(item.date, { item, missed: false }));
  if (days.size === 0) return null;
  const critical = forecast.has_income;

  return (
    <Panel title="Coming up" flush className={className}>
      <ul>
        {[...days.keys()].sort().map((date) => {
          const balance = balances.get(date);
          return (
            <li key={date}>
              <div className="flex items-center justify-between bg-surface-2 px-5 py-1.5 text-xs">
                <span className="font-medium tracking-wide text-ink-muted uppercase">{longDay(date)}</span>
                {balance !== undefined && (
                  <span className={cn("num", critical && balance < 0 ? "text-critical" : "text-ink-secondary")}>
                    {whole(balance)}
                  </span>
                )}
              </div>
              <ul className="divide-y divide-border">
                {days.get(date).map(({ item, missed }, i) => (
                  <ItemRow key={`${item.source}-${item.name}-${i}`} item={item} missed={missed} onOpenExpected={onOpenExpected} />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ItemRow({ item, missed, onOpenExpected }) {
  const target = itemTarget(item);
  const rowClass = cn(
    "flex min-h-11 w-full items-center gap-3 px-5 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
    missed && "opacity-60",
  );
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-sm text-ink-primary">
          <span className="truncate">{item.name}</span>
          {item.late_since && !missed && <StatusBadge tone="warning">Not seen</StatusBadge>}
        </span>
        <span className="truncate text-xs text-ink-muted">{itemCaption(item, missed)}</span>
      </span>
      <Amount cents={item.amount_cents} signed className={cn("text-sm", missed && "line-through")} />
    </>
  );
  return (
    <li>
      {target ? (
        <Link to={target} className={rowClass}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={() => onOpenExpected(item.link.expected)} className={rowClass}>
          {content}
        </button>
      )}
    </li>
  );
}

const STATUS = {
  received: (i) => ({ text: `Received ${formatDayMonth(i.received_on)}`, tone: "text-positive" }),
  next: (i) => ({ text: `Next ${formatDayMonth(i.next_on)}`, tone: "text-ink-muted" }),
  late: () => ({ text: "Not seen yet · expected tomorrow", tone: "text-warning" }),
  unrecognisable: () => ({ text: "Choose how to recognise it", tone: "text-warning" }),
  budgeted: () => ({ text: "Already in a budget, not counted", tone: "text-ink-muted" }),
};

function ExpectedPanel({ items, loading, onAdd, onAddIncome, onOpen, className }) {
  const empty = items && items.length === 0;
  return (
    <Panel
      title="Expected"
      flush
      loading={loading}
      className={className}
      actions={
        !empty && (
          <Button variant="outline" size="sm" onClick={onAdd}>
            Add item
          </Button>
        )
      }
    >
      {empty ? (
        <EmptyState
          className="px-5"
          action={
            <Button size="sm" onClick={onAddIncome}>
              Add expected income
            </Button>
          }
        >
          Income such as your salary goes here, so the forecast knows what comes in.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {(items ?? []).map((item) => {
            const status = STATUS[item.status](item);
            const signed = item.direction === "in" ? item.amount_cents : -item.amount_cents;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className="flex min-h-11 w-full items-center gap-3 px-5 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                >
                  <span className="num w-6 shrink-0 text-sm text-ink-muted">{item.day}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-ink-primary">{item.name}</span>
                    <span className={cn("truncate text-xs", status.tone)}>{status.text}</span>
                  </span>
                  <span className="num shrink-0 text-sm">{formatMoneyWhole(signed, { signed: true })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const DIRECTIONS = [
  { value: "in", label: "In" },
  { value: "out", label: "Out" },
];

const HINTS = {
  in: "Counts as received when money comes in here this month.",
  out: "Counts as paid when money goes out here this month.",
};

function ExpectedSheet({ sheet, options, wide, onClose, onSaved }) {
  const item = sheet?.item;
  const [direction, setDirection] = useState(item?.direction ?? sheet?.direction ?? "in");
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState(item ? (item.amount_cents / 100).toFixed(2) : "");
  const [day, setDay] = useState(item ? String(item.day) : "");
  const [category, setCategory] = useState(item?.category ?? null);
  const [account, setAccount] = useState(item?.account ?? null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const accountName = options.accounts.find((a) => a.id === account)?.name;

  async function save(event) {
    event.preventDefault();
    const cents = parseCents(amount);
    setBusy(true);
    try {
      const body = { name, direction, amount_cents: cents ?? 0, day: Number(day), category, account };
      if (item) await updateExpectedItem(item.id, body);
      else await createExpectedItem(body);
      toast.success(item ? `${name} updated.` : `${name} added.`);
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteExpectedItem(item.id);
      toast.success(`${item.name} deleted.`);
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Sheet open={Boolean(sheet)} onClose={onClose} wide={wide}>
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-border px-5 py-4 pr-10">
          <DialogTitle className="text-base">{item ? item.name : "Expected item"}</DialogTitle>
          <p className="mt-1 text-xs text-ink-muted">Money you expect every month that no bill, loan or budget covers.</p>
        </div>
        <div className="flex flex-col gap-4 px-5 py-4">
          <SegmentedControl label="In or out" options={DIRECTIONS} value={direction} onChange={setDirection} className="self-start" />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="expected-name">Name</Label>
            <Input id="expected-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Salary" required />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="expected-amount">About</Label>
              <Input
                id="expected-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="4500.00"
                required
              />
            </div>
            <div className="flex w-24 flex-col gap-1.5">
              <Label htmlFor="expected-day">Day</Label>
              <Input
                id="expected-day"
                type="number"
                min={1}
                max={31}
                value={day}
                onChange={(e) => setDay(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Recognise by</Label>
            <CategoryCombobox
              categories={options.categories.map((c) => ({ ...c, is_tab: false }))}
              value={category}
              onSelect={(id) => {
                setCategory(id);
                setAccount(null);
              }}
              transferAccounts={options.accounts}
              transferAccountId={account}
              transferAccountName={accountName}
              direction={direction}
              onSelectTransfer={(id) => {
                setAccount(id);
                setCategory(null);
              }}
              clearLabel="Choose a category or account"
              placeholder="Choose a category or account"
              aria-label="Recognise by"
            />
            <p className="text-xs text-ink-muted">{HINTS[direction]}</p>
          </div>
        </div>
        <div className="mt-auto flex items-center gap-2 border-t border-border px-5 py-3">
          {item && (
            <Button type="button" variant="ghost" onClick={remove} disabled={busy} className="mr-auto text-critical">
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose} disabled={busy} className={cn(!item && "ml-auto")}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

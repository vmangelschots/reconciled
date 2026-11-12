import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, Tags } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getBudgetSummary, setBudgetStartMonth } from "../api/budgets";
import { listCategories } from "../api/categories";
import { BillBar } from "../components/BillBar";
import { BudgetSheet } from "../components/BudgetSheet";
import { Button, buttonVariants } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { MonthSwitcher } from "../components/ui/MonthSwitcher";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Stat } from "../components/ui/Stat";
import { useToast } from "../components/ui/Toast";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  billWarning,
  budgetExtras,
  budgetList,
  categoryWarning,
  perDayCents,
  startMonthLine,
  verdict,
  yearlyWarning,
} from "../lib/budgetOverview";
import { cn } from "../lib/cn";
import { formatMoneyWhole as whole } from "../lib/money";
import { currentMonth, isMonth, monthLabel } from "../lib/months";
import { formatDayMonth } from "../lib/yearlyBudgets";

export function BudgetsPage() {
  const [categories, setCategories] = useState(null);
  // The month lives in the address (?month=YYYY-MM) so the overview can
  // link to a given month - see specs/budgets.
  const [searchParams, setSearchParams] = useSearchParams();
  const month = isMonth(searchParams.get("month")) ? searchParams.get("month") : currentMonth();
  const setMonth = (m) => setSearchParams({ month: m }, { replace: true });
  const [summary, setSummary] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const isWide = useMediaQuery("(min-width: 640px)");
  const toast = useToast();

  function reloadSummary() {
    return getBudgetSummary(month).then(setSummary).catch((e) => toast.error(e.message));
  }

  useEffect(() => {
    listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    setSelectedId(null);
    reloadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function handleBudgetSaved(id) {
    toast.success("Budget updated.");
    setSelectedId(null);
    setHighlightId(id);
    await listCategories().then(setCategories);
    await reloadSummary();
  }

  async function handleStartMonth(startMonth) {
    try {
      await setBudgetStartMonth(startMonth);
      toast.success(startMonth ? `Yearly budgets count from ${monthLabel(startMonth)}.` : "Start month cleared.");
      await reloadSummary();
      return true;
    } catch (e) {
      toast.error(e.message);
      return false;
    }
  }

  const header = (
    <PageHeader
      title="Budgets"
      actions={
        <Link to="/categories" className={buttonVariants({ variant: "outline" })}>
          <Tags className="h-4 w-4" aria-hidden="true" />
          Categories
        </Link>
      }
    >
      <MonthSwitcher month={month} onChange={setMonth} />
    </PageHeader>
  );

  if (categories?.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        {header}
        <Panel>
          <EmptyState
            action={
              <Link to="/categories" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Add a category
              </Link>
            }
          >
            No categories yet.
          </EmptyState>
        </Panel>
      </section>
    );
  }

  const loaded = summary && categories;
  const list = loaded ? budgetList(summary, categories) : null;
  const selected = list ? ([...list.rows, ...list.noBudget.rows].find((r) => r.id === selectedId) ?? null) : null;

  return (
    <section className="flex flex-col gap-6">
      {header}
      {loaded ? (
        <Fragment key={month}>
          <Headline summary={summary} month={month} onOpen={setSelectedId} />
          <Panel flush className="overflow-hidden">
            <ul className="divide-y divide-border">
              {list.rows.map((row) => (
                <BudgetRow key={row.id} row={row} highlight={row.id === highlightId} onOpen={setSelectedId} />
              ))}
              {summary.yearly.starts && <BeforeStart starts={summary.yearly.starts} onMonthChange={setMonth} />}
              {list.noBudget.count > 0 && (
                <NoBudget group={list.noBudget} highlightId={highlightId} onOpen={setSelectedId} />
              )}
              <li className="flex min-h-11 items-center gap-3 px-5 py-2 text-sm">
                <span className="flex-1 text-ink-secondary">Uncategorized</span>
                <span className="num text-ink-secondary">{whole(summary.totals.uncategorized_cents)} spent</span>
                <Link to="/review" className="text-accent hover:underline">
                  Review →
                </Link>
              </li>
              <StartMonthLine yearly={summary.yearly} onSave={handleStartMonth} />
            </ul>
          </Panel>
        </Fragment>
      ) : (
        <Panel loading />
      )}
      <BudgetSheet
        row={selected}
        categories={categories ?? []}
        month={month}
        startMonth={summary?.yearly?.start_month}
        wide={isWide}
        onSaved={handleBudgetSaved}
        onChanged={reloadSummary}
        onClose={() => setSelectedId(null)}
      />
    </section>
  );
}

function Headline({ summary, month, onOpen }) {
  const { totals, attention, days_left: daysLeft } = summary;
  const label = verdict(summary, month, currentMonth());
  const extras = budgetExtras(totals);
  const items = [
    ...attention.categories.map((c) => ({ id: c.id, key: `category-${c.id}`, ...categoryWarning(c) })),
    ...attention.yearly.map((y) => ({ id: y.id, key: `yearly-${y.id}`, ...yearlyWarning(y, month.slice(0, 4)) })),
    ...(attention.bills ?? []).map((b) => ({ id: b.category_id, key: `bill-${b.bill_id}`, ...billWarning(b) })),
  ];
  const left = totals.limit_cents - totals.spent_cents;
  // Bills not paid yet are spoken for, so they don't count as left per day.
  const perDay = perDayCents(left - (totals.bills_unpaid_cents ?? 0), daysLeft);
  return (
    <Panel flush>
      <div className="flex flex-col lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-5">
          {totals.has_limits ? (
            <Stat
              label={label ?? "Budget"}
              value={
                <>
                  {whole(totals.spent_cents)}
                  <span className="text-base font-normal text-ink-muted"> of {whole(totals.limit_cents)}</span>
                </>
              }
            >
              <ProgressBar className="my-2" label="Budget spent" value={totals.spent_cents} max={totals.limit_cents} marker={totals.marker} />
              <span className={cn("text-sm", left < 0 ? "text-critical" : "text-ink-secondary")}>
                {left < 0 ? `${whole(-left)} over` : `${whole(left)} left`}
                {perDay != null && ` · ${whole(perDay)} a day`}
              </span>
            </Stat>
          ) : (
            <Stat
              label={label ?? "Spent"}
              value={whole(totals.spent_cents + totals.outside_cents + totals.uncategorized_cents + totals.yearly_spent_cents)}
            >
              <span className="text-sm text-ink-secondary">Click a category to set a budget.</span>
            </Stat>
          )}
          {totals.has_limits && extras.length > 0 && <span className="text-xs text-ink-muted">{extras.join(" · ")}</span>}
        </div>
        {items.length > 0 && (
          <div className="border-t border-border lg:w-80 lg:border-t-0 lg:border-l">
            <h2 className="px-5 pt-4 text-[15px] font-semibold text-ink-primary">Needs a look</h2>
            <ul className="flex flex-col py-2">
              {items.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onOpen(item.id)}
                    className="flex min-h-11 w-full items-center gap-3 px-5 py-1.5 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    {item.upcoming ? (
                      <CalendarClock className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                    ) : (
                      <AlertTriangle
                        className={cn("h-4 w-4 shrink-0", item.critical ? "text-critical" : "text-warning")}
                        aria-hidden="true"
                      />
                    )}
                    <span className="flex min-w-0 flex-col">
                      <span className={cn("truncate text-sm", item.critical ? "text-critical" : "text-ink-primary")}>
                        {item.primary}
                      </span>
                      <span className="truncate text-xs text-ink-muted">{item.secondary}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}

const HIGHLIGHT = "animate-[review-return_400ms_ease-out] bg-accent/5";

/**
 * One budget, the same shape for every kind: the name, a bar and one figure
 * on a line with the caption below, or stacked on a phone.
 */
function BudgetRow({ row, highlight, onOpen }) {
  return (
    <li className={cn(highlight && HIGHLIGHT)}>
      <button
        type="button"
        aria-label={`Open budget for ${row.name}`}
        onClick={() => onOpen(row.id)}
        className={cn(
          "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2.5 pr-5 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
          // The name column gives up the indent, so all bars line up.
          row.indent
            ? "pl-9 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_8rem]"
            : "pl-5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_8rem]",
        )}
      >
        <span className={cn("truncate text-sm", row.indent ? "text-ink-secondary" : "font-medium text-ink-primary")}>
          {row.name}
        </span>
        <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
          {row.bar && <ProgressBar label={`${row.name} spent`} {...row.bar} />}
          {row.bills && <BillBar label={`${row.name} bills`} bills={row.bills} />}
        </span>
        <span
          className={cn(
            "num text-right text-sm",
            row.critical ? "font-medium text-critical" : row.budgeted ? "text-ink-primary" : "text-ink-secondary",
          )}
        >
          {row.figure}
        </span>
        {row.caption && <span className="order-4 col-span-2 text-xs text-ink-muted sm:col-span-3">{row.caption}</span>}
      </button>
    </li>
  );
}

function NoBudget({ group, highlightId, onOpen }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <>
      <li>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center gap-2 px-5 py-2 text-left text-sm text-ink-secondary hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
        >
          <span>No budget ({group.count})</span>
          <Chevron className="h-4 w-4" aria-hidden="true" />
          <span className="num ml-auto">{whole(group.spentCents)} spent</span>
        </button>
      </li>
      {open &&
        group.rows.map((row) => (
          <BudgetRow key={row.id} row={row} highlight={row.id === highlightId} onOpen={onOpen} />
        ))}
    </>
  );
}

function BeforeStart({ starts, onMonthChange }) {
  const startsMonth = starts.slice(0, 7);
  return (
    <li>
      <EmptyState
        action={
          <Button variant="outline" size="sm" onClick={() => onMonthChange(startsMonth)}>
            Go to {monthLabel(startsMonth)}
          </Button>
        }
      >
        Budgeting by year starts in {monthLabel(startsMonth)}.
      </EmptyState>
    </li>
  );
}

function StartMonthLine({ yearly, onSave }) {
  const [editing, setEditing] = useState(false);
  const start = yearly.start_month?.slice(0, 7) ?? null;
  return (
    <li className="px-5 py-2 text-xs text-ink-muted">
      {editing ? (
        <StartMonthStrip
          start={start}
          onSave={async (value) => {
            if (await onSave(value)) setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-x-3">
          <span>
            {startMonthLine(yearly)}
            {yearly.categories.length > 0 && `, to ${formatDayMonth(yearly.through)}`}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {start ? "Change" : "Set start month"}
          </Button>
        </div>
      )}
    </li>
  );
}

function StartMonthStrip({ start, onSave, onCancel }) {
  const [value, setValue] = useState(start ?? currentMonth());
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-ink-secondary">Yearly budgets count from</span>
      <MonthSwitcher month={value} onChange={setValue} short />
      <Button size="sm" onClick={() => onSave(value)}>
        Save
      </Button>
      {start && (
        <Button size="sm" variant="ghost" onClick={() => onSave(null)}>
          Clear
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

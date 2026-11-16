import { AlertTriangle, ChevronDown, Clock, Copy, Landmark, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addIncomeLine,
  addPlanCategory,
  createPlan,
  deletePlan,
  duplicatePlan,
  getCurrentPlan,
  getIncomeSuggestions,
  getPlan,
  listPlans,
  updatePlan,
} from "../api/plans";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { cn } from "../lib/cn";
import { formatMoneyWhole as whole } from "../lib/money";
import { currentMonth } from "../lib/months";
import { formatDayMonth } from "../lib/yearlyBudgets";
import { actualHeader, currentFigure, incomeCaption, longMonth, planCaption } from "../lib/yearPlans";
import { ApplyPlanDialog } from "./ApplyPlanDialog";
import { IncomeLineDialog } from "./IncomeLineDialog";
import { PlanSheet } from "./PlanSheet";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { EmptyState } from "./ui/EmptyState";
import { Input } from "./ui/Input";
import { Panel } from "./ui/Panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/Select";
import { StatusBadge } from "./ui/StatusBadge";
import { useToast } from "./ui/Toast";

const ROW_GRID = "grid w-full items-center gap-x-4 gap-y-1 text-left";
const WIDE_COLUMNS = "lg:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_7rem_6rem_9rem]";

// "Applied 12 Jun, from July" - see specs/year-plans, "Applied drafts are kept".
function appliedStamp(plan) {
  return `Applied ${formatDayMonth(plan.applied_at.slice(0, 10))}, from ${longMonth(plan.from_month)}`;
}

function thisYear() {
  return Number(currentMonth().slice(0, 4));
}

function thisMonthNumber() {
  return Number(currentMonth().slice(5, 7));
}

// Parents first, each followed by its subcategories, as the month view lists them.
function inCategoryOrder(rows) {
  const ids = new Set(rows.map((r) => r.category_id));
  const top = rows.filter((r) => r.parent_id == null || !ids.has(r.parent_id));
  const byName = (a, b) => a.category_name.localeCompare(b.category_name);
  return top.sort(byName).flatMap((row) => [
    row,
    ...rows.filter((r) => r.parent_id === row.category_id).sort(byName).map((r) => ({ ...r, indent: true })),
  ]);
}

/** Plan against actual: actual so far solid, the rest of the plan light, any excess critical. */
function YearBar({ plan, actual, label, light = false }) {
  if (!plan && !actual) return <span className="block h-2" />;
  const scale = Math.max(plan, actual, 1);
  const used = Math.min(actual, plan);
  const over = Math.max(actual - plan, 0);
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={label}>
      <span className={cn("h-full", light ? "bg-accent/60" : "bg-accent")} style={{ width: `${(used / scale) * 100}%` }} />
      <span className="h-full bg-accent/20" style={{ width: `${(Math.max(plan - actual, 0) / scale) * 100}%` }} />
      {over > 0 && <span className="h-full bg-critical" style={{ width: `${(over / scale) * 100}%` }} />}
    </span>
  );
}

function ChangeFigure({ cents, income = false }) {
  if (cents == null || cents === 0) return <span />;
  const good = income ? cents > 0 : cents < 0;
  return <span className={cn("num text-right text-sm", good ? "text-positive" : "text-critical")}>{whole(cents, { signed: true })}</span>;
}

function SectionLabel({ children, draft, actualLabel }) {
  return (
    <li className={cn(ROW_GRID, WIDE_COLUMNS, "hidden px-5 pt-3 pb-1 text-[11px] font-medium tracking-wide text-ink-muted uppercase lg:grid")}>
      <span>{children}</span>
      <span />
      <span className="text-right">Plan</span>
      <span className="text-right">{draft ? "Change" : ""}</span>
      <span className="text-right whitespace-nowrap normal-case">{actualLabel}</span>
    </li>
  );
}

function PhoneLabel({ children }) {
  return <li className="px-5 pt-3 pb-1 text-[11px] font-medium tracking-wide text-ink-muted uppercase lg:hidden">{children}</li>;
}

function PlanRow({ row, draft, onOpen }) {
  const second = draft ? <ChangeFigure cents={row.change_cents} /> : <Num cents={row.actual_cents} muted />;
  return (
    <li>
      <button
        type="button"
        aria-label={`Open ${row.category_name}`}
        onClick={() => onOpen(row.category_id)}
        className={cn(
          ROW_GRID,
          WIDE_COLUMNS,
          "grid-cols-[minmax(0,1fr)_auto_5rem] py-2.5 pr-5 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none",
          row.indent ? "pl-9" : "pl-5",
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {draft && row.changed && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-draft" aria-label="Changed" />}
          <span className={cn("truncate text-sm", row.indent ? "text-ink-secondary" : "font-medium text-ink-primary")}>
            {row.category_name}
          </span>
          {row.locked && <Landmark className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-label="From a loan" />}
        </span>
        <span className="order-4 col-span-3 lg:order-none lg:col-span-1">
          {row.kind !== "none" && <YearBar plan={row.plan_cents} actual={row.actual_cents} label={`${row.category_name} actual against plan`} />}
        </span>
        <span className="flex flex-col items-end">
          {draft && row.changed && row.current && (
            <span className="num text-xs text-ink-muted line-through">{whole(row.current.plan_cents)}</span>
          )}
          <span className={cn("num text-right text-sm", row.locked ? "text-ink-secondary" : row.kind === "none" ? "text-ink-muted" : "text-ink-primary")}>
            {row.kind === "none" ? "—" : whole(row.plan_cents)}
          </span>
        </span>
        <span className="text-right lg:hidden">{second}</span>
        <span className="hidden text-right lg:block">{draft ? <ChangeFigure cents={row.change_cents} /> : null}</span>
        <span className="hidden lg:block">
          <Num cents={row.actual_cents} muted />
        </span>
        <span className="order-5 col-span-3 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted lg:col-span-5">
          <span>{planCaption(row)}</span>
          {draft && row.changed && currentFigure(row) && <span>· was {currentFigure(row)}</span>}
          {row.changed_since_copy && (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Budget changed {row.changed_since_copy.from_cents == null ? "from none" : whole(row.changed_since_copy.from_cents)} →{" "}
              {whole(row.changed_since_copy.to_cents)} since the copy
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

function Num({ cents, muted = false }) {
  return (
    <span className={cn("num block text-right text-sm", muted ? "text-ink-secondary" : "text-ink-primary")}>
      {cents == null ? "—" : whole(cents)}
    </span>
  );
}

function Headline({ view, draft }) {
  const { totals } = view;
  const hasIncome = view.has_income;
  const short = totals.left_cents < 0;
  const expensesShare = hasIncome ? Math.min(totals.expenses_cents / Math.max(totals.income_cents, 1), 1) : 1;
  const overShare = hasIncome && short ? Math.min(-totals.left_cents / Math.max(totals.income_cents, 1), 1) : 0;
  return (
    <Panel>
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">
            {hasIncome ? (short ? "Short of income" : "Left to save") : "Planned expenses"}
          </span>
          {draft && totals.change_left_cents != null && totals.change_left_cents !== 0 && (
            <StatusBadge tone={totals.change_left_cents > 0 ? "positive" : "critical"}>
              {whole(totals.change_left_cents, { signed: true })} vs Current
            </StatusBadge>
          )}
        </div>
        {hasIncome ? (
          <p className="text-3xl font-semibold tracking-tight text-ink-primary">
            <span className={cn("num", short && "text-critical")}>{whole(Math.abs(totals.left_cents))}</span>
            <span className="text-base font-normal text-ink-muted">
              {" "}
              {short ? "short" : "left to save"}
              {totals.share != null && !short && ` · ${totals.share}% of ${whole(totals.income_cents)} income`}
            </span>
          </p>
        ) : (
          <p className="text-3xl font-semibold tracking-tight text-ink-primary">
            <span className="num">{whole(totals.expenses_cents)}</span>
            <span className="text-base font-normal text-ink-muted"> planned expenses</span>
          </p>
        )}
        {hasIncome && (
          <span className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Income split into expenses and saving">
            <span className="h-full bg-[var(--chart-series-2)]" style={{ width: `${(expensesShare - overShare) * 100}%` }} />
            {short ? (
              <span className="h-full bg-critical" style={{ width: `${overShare * 100}%` }} />
            ) : (
              <span className="h-full bg-positive" style={{ width: `${(1 - expensesShare) * 100}%` }} />
            )}
          </span>
        )}
        <span className="text-sm text-ink-secondary">
          {hasIncome ? `Expenses ${whole(totals.expenses_cents)}` : "Add income to see what's left to save."}
          {` · ${actualHeader(view.actual, view.year)} ${whole(totals.actual_expenses_cents)}`}
        </span>
        {totals.heading_left_cents != null && hasIncome && (
          <span className="text-sm text-ink-secondary">
            Heading for{" "}
            <span className={cn("num font-medium", totals.heading_left_cents < 0 ? "text-critical" : "text-ink-primary")}>
              {totals.heading_left_cents < 0 ? `${whole(-totals.heading_left_cents)} short` : `${whole(totals.heading_left_cents)} left to save`}
            </span>{" "}
            at this pace
          </span>
        )}
      </div>
    </Panel>
  );
}

function IncomePanel({ view, plan, editable, categories, draftTone, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const target = plan.kind === "current" ? { year: view.year } : plan.id;

  useEffect(() => {
    if (view.has_income || !editable) return;
    getIncomeSuggestions()
      .then((data) => setSuggestions(data.suggestions))
      .catch(() => setSuggestions([]));
  }, [view.has_income, editable]);

  async function add(items) {
    try {
      for (const s of items) {
        await addIncomeLine(target, { name: s.name, amount_cents: s.amount_cents, per: s.per, category: s.category });
      }
      toast.success(items.length === 1 ? `${items[0].name} added.` : `${items.length} income lines added.`);
      setSuggestions(null);
      await onChanged();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  const draft = plan.kind === "draft";
  return (
    <Panel
      flush
      title="Income"
      className={cn(draftTone && "ring-draft-ring")}
      actions={
        <>
          {plan.kind === "current" && <StatusBadge>Plan only</StatusBadge>}
          {editable && view.has_income && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-accent" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add
            </Button>
          )}
          {editable && !view.has_income && suggestions?.length > 1 && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-accent" onClick={() => add(suggestions)}>
              Add all
            </Button>
          )}
        </>
      }
    >
      {view.has_income ? (
        <ul className="divide-y divide-border pb-1">
          {view.income.map((line) => (
            <li key={line.id}>
              <button
                type="button"
                disabled={!editable}
                onClick={() => setEditing(line)}
                aria-label={`Open ${line.name}`}
                className={cn(ROW_GRID, WIDE_COLUMNS, "grid-cols-[minmax(0,1fr)_auto_5rem] py-2.5 pr-5 pl-5 enabled:hover:bg-surface-2")}
              >
                <span className="truncate text-sm font-medium text-ink-primary">{line.name}</span>
                <span className="order-4 col-span-3 lg:order-none lg:col-span-1">
                  {line.actual_cents != null && <YearBar plan={line.plan_cents} actual={line.actual_cents} label={`${line.name} actual against plan`} light />}
                </span>
                <span className="num text-right text-sm text-positive">{whole(line.plan_cents)}</span>
                <span className="text-right lg:hidden">
                  {!draft && <Num cents={line.actual_cents} muted />}
                </span>
                <span className="hidden lg:block" />
                <span className="hidden lg:block">
                  <Num cents={line.actual_cents} muted />
                </span>
                <span className="order-5 col-span-3 text-xs text-ink-muted lg:col-span-5">{incomeCaption(line)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : editable ? (
        suggestions?.length ? (
          <ul className="flex flex-col pb-2">
            {suggestions.map((s) => (
              <li key={`${s.source}-${s.name}`} className="flex items-center gap-3 px-5 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-ink-primary">
                    {s.name} {whole(s.amount_cents)} a {s.per}
                  </span>
                  <span className="text-xs text-ink-muted">{s.source === "forecast" ? "From the forecast" : "Last 12 months"}</span>
                </span>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-accent" onClick={() => add([s])}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add
                </Button>
              </li>
            ))}
            <li className="px-5 pt-1">
              <Button size="sm" variant="ghost" className="px-0 text-accent" onClick={() => setEditing("new")}>
                Add another income line
              </Button>
            </li>
          </ul>
        ) : (
          <EmptyState
            compact
            className="px-5 pb-5"
            action={
              <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add income line
              </Button>
            }
          >
            No income planned yet, such as Salary, 3,200 a month.
          </EmptyState>
        )
      ) : (
        <p className="px-5 pb-4 text-sm text-ink-muted">No income in this plan.</p>
      )}
      {editing && (
        <IncomeLineDialog
          open
          target={target}
          line={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            toast.success(message);
            setEditing(null);
            await onChanged();
          }}
        />
      )}
    </Panel>
  );
}

function AddCategoryDialog({ plan, onClose, onAdded }) {
  const toast = useToast();
  const [name, setName] = useState("");
  async function add(event) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      const category = await addPlanCategory(plan.id, name.trim());
      onAdded(category);
    } catch (e) {
      toast.error(e.data?.name?.[0] ?? e.data?.detail ?? e.message);
    }
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <form onSubmit={add} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a category</DialogTitle>
            <DialogDescription>
              It&apos;s added to your categories now and stays if you delete this draft. Its budget lives in {plan.name}.
            </DialogDescription>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Car fund" aria-label="Category name" autoFocus />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ plan, onClose, onRenamed }) {
  const [name, setName] = useState(plan.name);
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onRenamed(name.trim());
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>Rename draft</DialogTitle>
          </DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" autoFocus />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Rename</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Chip({ selected, draft, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap ring-1 transition-colors",
        selected ? "bg-ink-primary text-surface ring-ink-primary" : "bg-surface text-ink-secondary ring-border hover:text-ink-primary",
      )}
    >
      {draft && <span className={cn("h-1.5 w-1.5 rounded-full", selected ? "bg-surface" : "bg-draft")} aria-hidden="true" />}
      {children}
    </button>
  );
}

function Menu({ label, icon, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative shrink-0">
      <Button type="button" size="sm" variant="ghost" className="h-8 px-2" aria-expanded={open} aria-label={label} onClick={() => setOpen((v) => !v)}>
        {icon}
      </Button>
      {open && (
        <>
          <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <ul
            className="absolute right-0 z-40 mt-1 flex min-w-44 flex-col rounded-lg bg-surface py-1 shadow-lg ring-1 ring-border"
            onClick={() => setOpen(false)}
          >
            {children}
          </ul>
        </>
      )}
    </span>
  );
}

function MenuItem({ icon, onClick, children, tone }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn("flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2", tone === "critical" ? "text-critical" : "text-ink-primary")}
      >
        {icon}
        {children}
      </button>
    </li>
  );
}

function DraftBar({ plan, firstMonth, onFromMonth, onApply, phone }) {
  const months = Array.from({ length: 13 - firstMonth }, (_, i) => firstMonth + i);
  return (
    <div
      className={cn(
        "z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-draft-bar px-4 py-2.5 ring-1 ring-draft-ring",
        phone ? "fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] shadow-lg" : "sticky top-2",
      )}
      role="region"
      aria-label="Draft"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <span className="h-2 w-2 shrink-0 rounded-full bg-draft" aria-hidden="true" />
        <span className="truncate font-medium text-draft-ink">{plan.name}</span>
        <span className="hidden truncate text-ink-secondary sm:inline">· draft, not your budget yet</span>
      </span>
      <Select value={String(Math.max(plan.from_month, firstMonth))} onValueChange={(v) => onFromMonth(Number(v))}>
        <SelectTrigger className="h-8 w-40 bg-surface" aria-label="From month">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m} value={String(m)}>
              From {longMonth(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={onApply}>
        Apply…
      </Button>
    </div>
  );
}

/**
 * The Budgets page's Year view: Current and the year's drafts as chips, the
 * selected plan's headline, income and budgets, and applying a draft - see
 * specs/year-plans. `planId` is null for Current.
 */
export function YearPlanView({ year, planId, categories, openCategory, onPlanChange, onCategoriesChanged }) {
  const toast = useToast();
  const isWide = useMediaQuery("(min-width: 640px)");
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [list, setList] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(openCategory ?? null);
  const [applying, setApplying] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [plans, view] = await Promise.all([listPlans(year), planId ? getPlan(planId) : getCurrentPlan(year)]);
      setList(plans);
      setData(view);
    } catch (e) {
      setError(e.status === 404 ? "This plan doesn't exist any more." : e.message);
    }
  }, [year, planId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  useEffect(() => {
    if (openCategory != null) setSelectedId(openCategory);
  }, [openCategory]);

  const plan = data?.plan ? (data.plan.kind === "current" ? { ...data.plan, kind: "current" } : data.plan) : null;
  const draft = plan?.kind === "draft";
  const applied = plan?.kind === "applied";
  const phone = !isDesktop;

  // On a phone the draft bar sits above the tab bar; notifications go above it.
  useEffect(() => {
    if (!(draft && phone)) return undefined;
    document.documentElement.style.setProperty("--toast-lift", "4rem");
    return () => document.documentElement.style.removeProperty("--toast-lift");
  }, [draft, phone]);

  const rows = useMemo(() => (data ? inCategoryOrder(data.rows) : []), [data]);
  const selected = rows.find((r) => r.category_id === selectedId) ?? null;
  const firstMonth = year === thisYear() ? thisMonthNumber() : 1;

  async function newDraft(categoryId = null) {
    try {
      const created = await createPlan({ year });
      toast.success(`${created.name} made from Current.`);
      onPlanChange(created.id, categoryId);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  async function changeFromMonth(fromMonth) {
    try {
      await updatePlan(plan.id, { from_month: fromMonth });
      await load();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  async function rename(name) {
    try {
      await updatePlan(plan.id, { name });
      setRenaming(false);
      await load();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  async function duplicate() {
    try {
      const copy = await duplicatePlan(plan.id);
      toast.success(`${copy.name} made.`);
      onPlanChange(copy.id);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  async function remove() {
    try {
      await deletePlan(plan.id);
      setDeleting(false);
      toast.success(`${plan.name} deleted.`);
      onPlanChange(null);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  function applied_(fromMonth) {
    setApplying(false);
    const month = `${year}-${String(fromMonth).padStart(2, "0")}`;
    toast.success(`${plan.name} applied from ${longMonth(fromMonth)} ${year}.`, {
      action: { label: `Open ${longMonth(fromMonth)}`, onClick: () => onPlanChange(null, null, month) },
    });
    onPlanChange(null);
  }

  if (error) {
    return (
      <Panel>
        <EmptyState action={<Button variant="outline" size="sm" onClick={() => onPlanChange(null)}>Show Current</Button>}>{error}</EmptyState>
      </Panel>
    );
  }

  const chips = list && (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="Plans">
      <Chip selected={!planId} onClick={() => onPlanChange(null)}>
        Current budget
      </Chip>
      {list.drafts.map((d) => (
        <Chip key={d.id} draft selected={planId === d.id} onClick={() => onPlanChange(d.id)}>
          {d.name}
        </Chip>
      ))}
      {draft && (
        <Menu label={`${plan.name} actions`} icon={<MoreHorizontal className="h-4 w-4" aria-hidden="true" />}>
          <MenuItem icon={<Pencil className="h-4 w-4" aria-hidden="true" />} onClick={() => setRenaming(true)}>
            Rename
          </MenuItem>
          <MenuItem icon={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={duplicate}>
            Duplicate
          </MenuItem>
          <MenuItem icon={<Trash2 className="h-4 w-4" aria-hidden="true" />} tone="critical" onClick={() => setDeleting(true)}>
            Delete
          </MenuItem>
        </Menu>
      )}
      {list.can_draft && (
        <Button size="sm" variant="ghost" className="h-8 shrink-0 text-accent" onClick={() => newDraft()}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          New draft
        </Button>
      )}
      {list.history.length > 0 && (
        <span className="relative shrink-0">
          <Button size="sm" variant="ghost" className="h-8" aria-expanded={historyOpen} onClick={() => setHistoryOpen((v) => !v)}>
            <Clock className="h-4 w-4" aria-hidden="true" />
            History
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          {historyOpen && (
            <>
              <button type="button" aria-hidden="true" tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setHistoryOpen(false)} />
              <ul className="absolute right-0 z-40 mt-1 flex min-w-64 flex-col rounded-lg bg-surface py-1 shadow-lg ring-1 ring-border" aria-label="History">
                {list.history.map((h) => (
                  <MenuItem
                    key={h.id}
                    onClick={() => {
                      setHistoryOpen(false);
                      onPlanChange(h.id);
                    }}
                  >
                    <span className="flex flex-col">
                      {h.name}
                      <span className="text-xs text-ink-muted">{appliedStamp(h).toLowerCase()}</span>
                    </span>
                  </MenuItem>
                ))}
              </ul>
            </>
          )}
        </span>
      )}
    </div>
  );

  if (!data || !list) {
    return (
      <div className="flex flex-col gap-4">
        {chips}
        <Panel loading />
      </div>
    );
  }

  const nothing = !data.has_budgets && !data.has_income;
  const actualLabel = actualHeader(data.actual, year);
  const content = nothing ? (
    <Panel>
      <EmptyState
        action={
          <Button variant="outline" size="sm" onClick={() => onPlanChange(null, null, currentMonth())}>
            Open the month view
          </Button>
        }
      >
        Nothing to plan yet. Set a first budget in the month view.
      </EmptyState>
    </Panel>
  ) : (
    <>
      <Headline view={data} draft={draft} />
      <IncomePanel
        key={`${plan.kind}-${plan.id}-${year}`}
        view={data}
        plan={plan}
        editable={plan.kind === "current" || draft}
        categories={categories}
        draftTone={draft}
        onChanged={load}
      />
      <Panel
        flush
        title="Expenses"
        className={cn("overflow-hidden", draft && "ring-draft-ring")}
        actions={
          draft && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-accent" onClick={() => setAddingCategory(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add category
            </Button>
          )
        }
      >
        <ul className="divide-y divide-border">
          <SectionLabel draft={draft} actualLabel={actualLabel}>
            {data.split_month ? `So far | Still to come` : "Budget"}
          </SectionLabel>
          <PhoneLabel>{draft ? "Plan · Change" : `Plan · ${actualLabel}`}</PhoneLabel>
          {rows.map((row) => (
            <PlanRow key={row.category_id} row={row} draft={draft} onOpen={setSelectedId} />
          ))}
          <li className={cn(ROW_GRID, WIDE_COLUMNS, "grid-cols-[minmax(0,1fr)_auto_5rem] py-2.5 pr-5 pl-5 text-sm text-ink-secondary")}>
            <span>Not in the plan</span>
            <span className="order-5 col-span-3 text-xs text-ink-muted lg:order-none lg:col-span-1">No budget, and uncategorized</span>
            <span className="num text-right">—</span>
            <span className="text-right lg:hidden">{!draft && <Num cents={data.not_in_plan_cents} muted />}</span>
            <span className="hidden lg:block" />
            <span className="hidden lg:block">
              <Num cents={data.not_in_plan_cents} muted />
            </span>
          </li>
        </ul>
      </Panel>
    </>
  );

  return (
    <div className={cn("flex flex-col gap-4", draft && phone && "pb-16")}>
      {chips}
      {draft && <DraftBar plan={plan} firstMonth={firstMonth} onFromMonth={changeFromMonth} onApply={() => setApplying(true)} phone={phone} />}
      {applied && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-4 py-2.5 text-sm text-ink-secondary ring-1 ring-border">
          <StatusBadge>{appliedStamp(plan)}</StatusBadge>
          <span className="flex-1">A record of what was applied. It can&apos;t be changed.</span>
          {list.can_draft && (
            <Button size="sm" variant="outline" onClick={duplicate}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Duplicate
            </Button>
          )}
        </div>
      )}
      <div
        className={cn(
          "flex flex-col gap-4",
          draft && "-mx-2 rounded-2xl bg-draft-tint p-2 sm:-mx-3 sm:p-3",
          applied && "opacity-80",
        )}
      >
        {content}
      </div>
      {plan && (
        <PlanSheet
          row={selected}
          plan={plan}
          view={data}
          wide={isWide}
          onClose={() => setSelectedId(null)}
          onSaved={async (message) => {
            toast.success(message);
            setSelectedId(null);
            await load();
          }}
          onChangeInDraft={(categoryId) => {
            setSelectedId(null);
            newDraft(categoryId);
          }}
        />
      )}
      {applying && draft && (
        <ApplyPlanDialog plan={plan} open firstMonth={firstMonth} onClose={() => setApplying(false)} onApplied={applied_} />
      )}
      {renaming && <RenameDialog plan={plan} onClose={() => setRenaming(false)} onRenamed={rename} />}
      {addingCategory && (
        <AddCategoryDialog
          plan={plan}
          onClose={() => setAddingCategory(false)}
          onAdded={async (category) => {
            setAddingCategory(false);
            toast.success(`${category.name} added to your categories.`);
            await onCategoriesChanged?.();
            await load();
            setSelectedId(category.id);
          }}
        />
      )}
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {plan?.name}?</DialogTitle>
            <DialogDescription>The draft goes. Your budget isn&apos;t touched.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove}>
              Delete draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { AlertTriangle, CalendarClock, Calendar, CheckCircle2, ChevronDown, HandCoins, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getBudgetSummary, setBudgetStartMonth } from "../api/budgets";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "../api/categories";
import { listTabs } from "../api/tabs";
import { BudgetEditor } from "../components/BudgetEditor";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { MonthSwitcher } from "../components/ui/MonthSwitcher";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { ProgressBar } from "../components/ui/ProgressBar";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { buildCategoryTree } from "../lib/categoryTree";
import { cn } from "../lib/cn";
import { formatMoney } from "../lib/money";
import { currentMonth, isMonth, monthLabel } from "../lib/months";
import { tabSentence, TONE_CLASS } from "../lib/tabs";
import {
  budgetSummary,
  formatDayMonth,
  formatDue,
  formatShortMonth,
  runwayLabel,
  TARGET_TONE,
  targetLabel,
} from "../lib/yearlyBudgets";

// A missing limit shows as a dash rather than an amount.
function formatCents(cents) {
  if (cents == null) return "—";
  return formatMoney(cents);
}

export function BudgetsPage() {
  const [categories, setCategories] = useState([]);
  // The month lives in the address (?month=YYYY-MM) so the overview can
  // link to a given month - see specs/budgets.
  const [searchParams, setSearchParams] = useSearchParams();
  const month = isMonth(searchParams.get("month")) ? searchParams.get("month") : currentMonth();
  const setMonth = (m) => setSearchParams({ month: m }, { replace: true });
  const [summary, setSummary] = useState(null);
  const [editingId, setEditingId] = useState(null);
  // The category whose budget editor is open, and the one whose row just
  // moved between the monthly and yearly tables.
  const [budgetEditId, setBudgetEditId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [tabBalances, setTabBalances] = useState({});
  const isWide = useMediaQuery("(min-width: 640px)");
  const toast = useToast();

  function setPending(id, isPending) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (isPending) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function reloadCategories() {
    // Tab balances come along, since re-parenting can make a category a tab.
    listTabs()
      .then((tabs) => setTabBalances(Object.fromEntries(tabs.map((t) => [t.id, t.balance_cents]))))
      .catch(() => setTabBalances({}));
    return listCategories().then(setCategories);
  }

  function reloadSummary() {
    return getBudgetSummary(month).then(setSummary).catch((e) => toast.error(e.message));
  }

  useEffect(() => {
    reloadCategories();
  }, []);

  useEffect(() => {
    setBudgetEditId(null);
    reloadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function handleAddCategory(values) {
    await createCategory(values.name, values.parent, values.is_tab_group);
    toast.success("Category created.");
    await reloadCategories();
    await reloadSummary();
  }

  async function handleSaveCategory(id, values) {
    await updateCategory(id, values);
    toast.success("Category updated.");
    setEditingId(null);
    await reloadCategories();
    await reloadSummary();
  }

  async function handleDelete(id) {
    setPending(id, true);
    try {
      await deleteCategory(id);
      toast.success("Category deleted.");
      await reloadCategories();
      await reloadSummary();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setPending(id, false);
    }
  }

  async function handleBudgetSaved(id, movedTable) {
    toast.success("Budget updated.");
    setBudgetEditId(null);
    setHighlightId(movedTable ? id : null);
    await reloadCategories();
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

  const byId = Object.fromEntries(categories.map((c) => [c.id, c]));
  function renderEditor(id, name, limitCents) {
    return (
      <BudgetEditor
        key={id}
        category={byId[id] ?? { id, name, budget_kind: "monthly" }}
        month={month}
        limitCents={limitCents}
        startMonth={summary?.yearly?.start_month}
        onSaved={handleBudgetSaved}
        onCancel={() => setBudgetEditId(null)}
      />
    );
  }
  const listProps = {
    isWide,
    editingId: budgetEditId,
    onEdit: (id) => setBudgetEditId((current) => (current === id ? null : id)),
    highlightId,
  };

  const categoryTree = buildCategoryTree(categories);
  const monthlyItems = summary
    ? flattenTree(
        buildCategoryTree(summary.categories.map((row) => ({ ...row, id: row.category_id, name: row.category_name }))),
      ).map(({ row, indent }) => ({
        id: row.category_id,
        name: row.category_name,
        indent,
        budgetCents: row.limit_cents,
        spentCents: row.spent_cents,
        leftCents: row.remaining_cents,
        over: row.over_limit,
        status: (
          <span className={cn("text-sm", row.over_limit ? "font-semibold text-critical" : "text-ink-secondary")}>
            {row.limit_cents == null ? "No limit" : row.over_limit ? "Over limit" : "OK"}
          </span>
        ),
        editor: () => renderEditor(row.category_id, row.category_name, row.limit_cents),
      }))
    : [];
  const monthlyFooter = summary
    ? [
        { key: "uncategorized", label: "Uncategorized", spentCents: summary.uncategorized_spent_cents },
        summary.yearly_spent_cents > 0 && {
          key: "yearly",
          label: "Yearly budgets",
          spentCents: summary.yearly_spent_cents,
          note: "this month · see This year",
        },
      ].filter(Boolean)
    : [];

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title="Budgets">
        <MonthSwitcher month={month} onChange={setMonth} />
      </PageHeader>

      <Panel title="Monthly summary" flush loading={!summary} className="overflow-hidden">
        {summary && <BudgetList items={monthlyItems} footer={monthlyFooter} {...listProps} />}
      </Panel>

      {summary?.yearly && (
        <YearlyPanel
          yearly={summary.yearly}
          byId={byId}
          onMonthChange={setMonth}
          onStartMonth={handleStartMonth}
          renderEditor={renderEditor}
          listProps={listProps}
        />
      )}

      <Panel title="Categories">
        <div className="flex flex-col gap-4">
          <CategoryForm categories={categories} onSubmit={handleAddCategory} submitLabel="Add category" />

          <ul className="flex flex-col gap-3">
            {categoryTree.map((parent) => (
              <li key={parent.id} className="flex flex-col gap-2">
                <CategoryRow
                  category={parent}
                  categories={categories}
                  tabBalance={tabBalances[parent.id]}
                  editing={editingId === parent.id}
                  disabled={pendingIds.has(parent.id)}
                  onEdit={() => setEditingId(parent.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(values) => handleSaveCategory(parent.id, values)}
                  onDelete={() => handleDelete(parent.id)}
                />
                {parent.subcategories.length > 0 && (
                  <ul className="ml-6 flex flex-col gap-2 border-l border-border pl-4">
                    {parent.subcategories.map((sub) => (
                      <li key={sub.id}>
                        <CategoryRow
                          category={sub}
                          categories={categories}
                          tabBalance={tabBalances[sub.id]}
                          editing={editingId === sub.id}
                          disabled={pendingIds.has(sub.id)}
                          onEdit={() => setEditingId(sub.id)}
                          onCancelEdit={() => setEditingId(null)}
                          onSave={(values) => handleSaveCategory(sub.id, values)}
                          onDelete={() => handleDelete(sub.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {categoryTree.length === 0 && (
              <li>
                <EmptyState>No categories yet - add one above.</EmptyState>
              </li>
            )}
          </ul>
        </div>
      </Panel>
    </section>
  );
}

// Parents followed by their subcategories, each with whether it's indented.
function flattenTree(tree) {
  return tree.flatMap((parent) => [
    { row: parent, indent: false },
    ...(parent.subcategories ?? []).map((sub) => ({ row: sub, indent: true })),
  ]);
}

// The yearly rows, subcategories under a yearly parent; a yearly
// subcategory whose parent isn't yearly reads "Parent / Sub".
function yearlyTree(rows, byId) {
  const ids = new Set(rows.map((r) => r.category_id));
  const top = rows.filter((r) => !ids.has(r.parent_id));
  return top.flatMap((row) => [
    {
      row,
      indent: false,
      name: row.parent_id && byId[row.parent_id] ? `${byId[row.parent_id].name} / ${row.category_name}` : row.category_name,
    },
    ...rows.filter((r) => r.parent_id === row.category_id).map((sub) => ({ row: sub, indent: true, name: sub.category_name })),
  ]);
}

function YearlyPanel({ yearly, byId, onMonthChange, onStartMonth, renderEditor, listProps }) {
  const [settingStart, setSettingStart] = useState(false);
  const start = yearly.start_month?.slice(0, 7) ?? null;
  const items = yearlyTree(yearly.categories, byId).map(({ row, indent, name }) => ({
    id: row.category_id,
    name,
    indent,
    budgetCents: row.budget_cents,
    budgetNote: row.prorated_from
      ? `of ${formatMoney(row.amount_cents)} · from ${formatShortMonth(row.prorated_from)}`
      : row.kind === "target"
        ? `due ${formatDayMonth(row.due_date)}`
        : null,
    spentCents: row.spent_cents,
    leftCents: row.remaining_cents,
    over: row.over,
    status:
      row.kind === "target" ? <TargetStatus row={row} through={yearly.through} /> : <YearlyStatus row={row} year={yearly.year} />,
    editor: () => renderEditor(row.category_id, row.category_name, null),
  }));

  let body;
  if (yearly.starts) {
    const startsMonth = yearly.starts.slice(0, 7);
    body = (
      <EmptyState
        action={
          <Button variant="outline" size="sm" onClick={() => onMonthChange(startsMonth)}>
            Go to {monthLabel(startsMonth)}
          </Button>
        }
      >
        Budgeting by year starts in {monthLabel(startsMonth)}.
      </EmptyState>
    );
  } else if (items.length === 0) {
    body = <EmptyState>No yearly budgets yet. Open a category&apos;s budget and pick Yearly or On a date.</EmptyState>;
  } else {
    body = <BudgetList items={items} {...listProps} />;
  }

  return (
    <Panel
      flush
      className="overflow-hidden"
      title={
        <>
          This year ({yearly.year}){" "}
          <span className="text-sm font-normal text-ink-muted">· to {formatDayMonth(yearly.through)}</span>
        </>
      }
      actions={
        <Button variant="ghost" size="sm" onClick={() => setSettingStart((open) => !open)}>
          <Calendar className="h-4 w-4" aria-hidden="true" />
          {start ? `From ${monthLabel(start, { short: true })}` : "Set start month"}
        </Button>
      }
    >
      {settingStart && (
        <StartMonthStrip
          start={start}
          onSave={async (value) => {
            if (await onStartMonth(value)) setSettingStart(false);
          }}
          onCancel={() => setSettingStart(false)}
        />
      )}
      {body}
    </Panel>
  );
}

function StartMonthStrip({ start, onSave, onCancel }) {
  const [value, setValue] = useState(start ?? currentMonth());
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 pb-3">
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

function YearlyStatus({ row, year }) {
  const label = runwayLabel(row, year);
  return (
    <span className="flex w-full flex-col gap-1">
      <ProgressBar
        className="max-w-40"
        label={`${row.category_name} spent this year`}
        value={row.spent_cents}
        max={row.budget_cents}
        marker={row.pace}
        tone={row.ahead ? "warning" : undefined}
      />
      {label && <span className={cn("text-xs", row.over ? "text-critical" : "text-ink-muted")}>{label}</span>}
    </span>
  );
}

const TARGET_STYLE = {
  neutral: { Icon: CalendarClock, icon: "text-ink-muted", text: "text-ink-secondary" },
  reminder: { Icon: CalendarClock, icon: "text-warning", text: "text-ink-primary" },
  warning: { Icon: AlertTriangle, icon: "text-warning", text: "text-warning" },
  critical: { Icon: AlertTriangle, icon: "text-critical", text: "font-medium text-critical" },
  positive: { Icon: CheckCircle2, icon: "text-positive", text: "text-ink-secondary" },
};

function TargetStatus({ row, through }) {
  const { Icon, icon, text } = TARGET_STYLE[TARGET_TONE[row.state] ?? "neutral"];
  return (
    <span className={cn("flex items-center gap-1.5 text-sm", text, row.state === "paid_over" && "text-warning")}>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", icon)} aria-hidden="true" />
      {targetLabel(row, through)}
    </span>
  );
}

function EditBudgetButton({ name, onClick }) {
  return (
    <button
      type="button"
      aria-label={`Edit budget for ${name}`}
      onClick={onClick}
      className="rounded p-1 text-ink-muted hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

const HIGHLIGHT = "animate-[review-return_400ms_ease-out] bg-accent/5";

/**
 * The monthly and yearly figures, as a table on wide screens and stacked
 * rows on a phone. Each item opens its budget editor below it.
 */
function BudgetList({ items, footer = [], isWide, editingId, onEdit, highlightId }) {
  if (!isWide) {
    return (
      <ul className="divide-y divide-border border-t border-border">
        {items.map((item) => (
          <li key={item.id} className={cn("flex flex-col gap-1.5 px-5 py-3", item.id === highlightId && HIGHLIGHT)}>
            <div className="flex items-center gap-2">
              <span className={cn("min-w-0 flex-1 truncate text-sm", item.indent ? "pl-4 text-ink-secondary" : "text-ink-primary")}>
                {item.name}
              </span>
              {item.leftCents != null && (
                <span className={cn("num text-sm", item.leftCents < 0 ? "text-critical" : "text-ink-primary")}>
                  {formatMoney(item.leftCents)} left
                </span>
              )}
              <EditBudgetButton name={item.name} onClick={() => onEdit(item.id)} />
            </div>
            <span className="text-xs text-ink-muted">
              {formatMoney(item.spentCents)} {item.budgetCents == null ? "spent" : `of ${formatMoney(item.budgetCents)}`}
              {item.budgetNote && ` · ${item.budgetNote}`}
            </span>
            {item.status}
            {editingId === item.id && <div className="mt-2 rounded-md bg-surface-2 p-3">{item.editor()}</div>}
          </li>
        ))}
        {footer.map((row) => (
          <li key={row.key} className="flex items-center justify-between px-5 py-3 text-sm text-ink-secondary">
            <span>{row.label}</span>
            <span className="num">
              {formatMoney(row.spentCents)}
              {row.note && <span className="text-xs text-ink-muted"> {row.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Table>
      <colgroup>
        <col />
        <col className="w-36" />
        <col className="w-28" />
        <col className="w-28" />
        <col className="w-52" />
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Budget</TableHead>
          <TableHead className="text-right">Spent</TableHead>
          <TableHead className="text-right">Left</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <BudgetRows key={item.id} item={item} editing={editingId === item.id} onEdit={onEdit} highlight={item.id === highlightId} />
        ))}
        {footer.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="text-ink-secondary">{row.label}</TableCell>
            <TableCell className="text-right text-ink-muted">—</TableCell>
            <TableCell className="num text-right text-ink-secondary">{formatMoney(row.spentCents)}</TableCell>
            <TableCell className="text-right text-ink-muted">—</TableCell>
            <TableCell className="text-xs text-ink-muted">{row.note ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function BudgetRows({ item, editing, onEdit, highlight }) {
  return (
    <>
      <TableRow className={cn("group", highlight && HIGHLIGHT)}>
        <TableCell className={item.indent ? "pl-8 text-ink-secondary" : undefined}>{item.name}</TableCell>
        <TableCell className="text-right">
          <span className="flex items-center justify-end gap-1">
            <span className="num">{formatCents(item.budgetCents)}</span>
            <span className={cn(!editing && "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100")}>
              <EditBudgetButton name={item.name} onClick={() => onEdit(item.id)} />
            </span>
          </span>
          {item.budgetNote && <span className="block text-xs text-ink-muted">{item.budgetNote}</span>}
        </TableCell>
        <TableCell className="num text-right">{formatMoney(item.spentCents)}</TableCell>
        <TableCell className={cn("num text-right", item.over && "text-critical")}>{formatCents(item.leftCents)}</TableCell>
        <TableCell>{item.status}</TableCell>
      </TableRow>
      {editing && (
        <tr>
          <td colSpan={5} className="bg-surface-2 px-5 py-3">
            {item.editor()}
          </td>
        </tr>
      )}
    </>
  );
}

function CategoryRow({ category, categories, tabBalance, editing, disabled, onEdit, onCancelEdit, onSave, onDelete }) {
  const [showHistory, setShowHistory] = useState(false);
  if (editing) {
    return (
      <CategoryForm
        initialValues={category}
        categories={categories}
        onSubmit={onSave}
        onCancel={onCancelEdit}
        submitLabel="Save"
      />
    );
  }
  const summary = budgetSummary(category);
  const history = category.budget_kind !== "monthly" ? (category.yearly_history ?? []) : [];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm text-ink-primary">
          <span className="flex items-center gap-1.5">
            {(category.is_tab_group || category.is_tab) && (
              <HandCoins className="h-3.5 w-3.5 text-ink-muted" aria-label="Tab" />
            )}
            {category.name}
          </span>
          {category.is_tab_group && <span className="text-xs text-ink-muted">Tab group · not budgeted</span>}
          {category.is_tab && <TabBalance name={category.name} cents={tabBalance ?? 0} />}
          {summary && <span className="text-xs text-ink-muted">{summary}</span>}
          {history.length >= 2 && (
            <button
              type="button"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((open) => !open)}
              className="flex items-center gap-0.5 text-xs text-ink-secondary hover:text-ink-primary"
            >
              History
              <ChevronDown className={cn("h-3 w-3 transition-transform", showHistory && "rotate-180")} aria-hidden="true" />
            </button>
          )}
        </span>
        <Button variant="outline" size="sm" disabled={disabled} onClick={onEdit}>
          Rename
        </Button>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onDelete}>
          Delete
        </Button>
      </div>
      {showHistory && history.length >= 2 && (
        <ul aria-label={`${category.name} history`} className="ml-6 flex flex-col gap-0.5 border-l border-border pl-4 text-xs">
          {history.map((line, i) => (
            <li key={line.from_year} className="grid max-w-72 grid-cols-[6rem_1fr] text-ink-secondary">
              <span>{i === 0 ? `${line.from_year} onward` : line.from_year}</span>
              <span className="num">
                {formatMoney(line.amount_cents)}
                {line.due && ` · due ${formatDue(line.due)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TabBalance({ name, cents }) {
  const sentence = tabSentence(name, cents);
  return <span className={cn("text-xs", TONE_CLASS[sentence.tone])}>{sentence.text}</span>;
}

function KindSwitch({ isTabGroup, onChange }) {
  return (
    <SegmentedControl
      label="Kind"
      value={isTabGroup}
      onChange={onChange}
      options={[
        { value: false, label: "Budget" },
        { value: true, label: "Tab", icon: HandCoins },
      ]}
    />
  );
}

function CategoryForm({ initialValues, categories, onSubmit, onCancel, submitLabel }) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [parentId, setParentId] = useState(initialValues?.parent ?? null);
  const [isTabGroup, setIsTabGroup] = useState(initialValues?.is_tab_group ?? false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const parent = categories.find((c) => c.id === parentId);
  const tabGroup = parentId == null && isTabGroup;
  // Rows already in this group's subcategories move in or out of the
  // reports when its kind changes, so that asks first.
  const movedRows =
    initialValues && parentId == null && tabGroup !== Boolean(initialValues.is_tab_group)
      ? categories
          .filter((c) => c.parent === initialValues.id)
          .reduce((n, c) => n + (c.transaction_count ?? 0), 0)
      : 0;

  // Only top-level categories are valid parents (two levels max), and a
  // category can't be its own parent.
  const parentCandidates = categories.filter(
    (c) => c.parent == null && (!initialValues || c.id !== initialValues.id),
  );

  async function handleSubmit(event) {
    event.preventDefault();
    if (movedRows > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setSubmitting(true);
    try {
      await onSubmit({ name, parent: parentId, is_tab_group: tabGroup });
      if (!initialValues) {
        setName("");
        setParentId(null);
        setIsTabGroup(false);
      }
    } catch (e) {
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-name">Name</Label>
        <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Parent</Label>
        <CategoryCombobox
          categories={parentCandidates}
          offerTabGroups
          value={parentId}
          onSelect={setParentId}
          clearLabel="No parent (top-level)"
          placeholder="No parent (top-level)"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Kind</Label>
        {parentId == null ? (
          <KindSwitch
            isTabGroup={isTabGroup}
            onChange={(value) => {
              setIsTabGroup(value);
              setConfirming(false);
            }}
          />
        ) : (
          <span className="flex h-8 items-center gap-1.5 text-sm text-ink-muted">
            {parent?.is_tab_group && <HandCoins className="h-3.5 w-3.5" aria-hidden="true" />}
            {parent?.is_tab_group ? "Tab" : "Budget"}, from {parent?.name}
          </span>
        )}
      </div>
      {confirming ? (
        <div className="flex w-full flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-ink-primary">
          <span className="flex-1">
            {movedRows} {movedRows === 1 ? "transaction" : "transactions"} in its subcategories will{" "}
            {tabGroup ? "stop counting" : "count again"} in budgets and the dashboard.
          </span>
          <Button type="submit" size="sm" disabled={submitting}>
            {tabGroup ? "Make it a tab group" : "Make it a budget group"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <Button type="submit" disabled={submitting}>
            {submitLabel}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </>
      )}
    </form>
  );
}

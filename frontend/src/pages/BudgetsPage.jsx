import { HandCoins } from "lucide-react";
import { useEffect, useState } from "react";
import { getBudgetSummary } from "../api/budgets";
import {
  createCategory,
  deleteCategory,
  listCategories,
  setCategoryLimit,
  updateCategory,
} from "../api/categories";
import { listTabs } from "../api/tabs";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { buildCategoryTree } from "../lib/categoryTree";
import { cn } from "../lib/cn";
import { formatMoney } from "../lib/money";
import { tabSentence, TONE_CLASS } from "../lib/tabs";

// A missing limit shows as a dash rather than an amount.
function formatCents(cents) {
  if (cents == null) return "—";
  return formatMoney(cents);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function BudgetsPage() {
  const [categories, setCategories] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [tabBalances, setTabBalances] = useState({});
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

  async function handleSetLimit(id, amountText, isOverride) {
    await setCategoryLimit(id, {
      month: isOverride ? month : null,
      limit_cents: Math.round(parseFloat(amountText || "0") * 100),
    });
    toast.success("Limit updated.");
    await reloadSummary();
  }

  const categoryTree = buildCategoryTree(categories);
  const summaryTree = summary
    ? buildCategoryTree(summary.categories.map((row) => ({ ...row, id: row.category_id, name: row.category_name })))
    : [];

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink-primary">Budgets</h1>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
              <li className="text-sm text-ink-secondary">No categories yet - add one above.</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold text-ink-primary">Monthly summary</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="summary-month">Month</Label>
            <Input
              id="summary-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-40"
            />
          </div>
        </div>

        {summary && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Limit</TableHead>
                <TableHead>Spent</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Set limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryTree.map((parent) => (
                <SummaryRows key={parent.category_id} row={parent} onSetLimit={handleSetLimit} />
              ))}
              <TableRow>
                <TableCell>Uncategorized</TableCell>
                <TableCell>—</TableCell>
                <TableCell>{formatCents(summary.uncategorized_spent_cents)}</TableCell>
                <TableCell>—</TableCell>
                <TableCell>—</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}

function SummaryRows({ row, onSetLimit, indent = false }) {
  return (
    <>
      <TableRow>
        <TableCell className={indent ? "pl-8 text-ink-secondary" : undefined}>{row.category_name}</TableCell>
        <TableCell>{formatCents(row.limit_cents)}</TableCell>
        <TableCell>{formatCents(row.spent_cents)}</TableCell>
        <TableCell>{formatCents(row.remaining_cents)}</TableCell>
        <TableCell className={cn(row.over_limit && "font-semibold text-critical")}>
          {row.limit_cents == null ? "No limit" : row.over_limit ? "Over limit" : "OK"}
        </TableCell>
        <TableCell>
          <LimitForm onSave={(amount, isOverride) => onSetLimit(row.category_id, amount, isOverride)} />
        </TableCell>
      </TableRow>
      {row.subcategories?.map((sub) => (
        <SummaryRows key={sub.category_id} row={sub} onSetLimit={onSetLimit} indent />
      ))}
    </>
  );
}

function CategoryRow({ category, categories, tabBalance, editing, disabled, onEdit, onCancelEdit, onSave, onDelete }) {
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
  return (
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
      </span>
      <Button variant="outline" size="sm" disabled={disabled} onClick={onEdit}>
        Rename
      </Button>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}

function TabBalance({ name, cents }) {
  const sentence = tabSentence(name, cents);
  return <span className={cn("text-xs", TONE_CLASS[sentence.tone])}>{sentence.text}</span>;
}

function KindSwitch({ isTabGroup, onChange }) {
  const option = (value, label) => (
    <button
      type="button"
      aria-pressed={isTabGroup === value}
      onClick={() => onChange(value)}
      className={cn(
        "flex h-8 items-center gap-1.5 px-3 text-sm",
        isTabGroup === value ? "bg-accent text-white" : "bg-surface text-ink-secondary hover:text-ink-primary",
      )}
    >
      {value && <HandCoins className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Kind" className="flex overflow-hidden rounded-md border border-border">
      {option(false, "Budget")}
      {option(true, "Tab")}
    </div>
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

function LimitForm({ onSave }) {
  const [amount, setAmount] = useState("");
  const [isOverride, setIsOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function handleSave() {
    setSubmitting(true);
    try {
      await onSave(amount, isOverride);
    } catch (e) {
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <Input
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="amount"
        className="w-24"
      />
      <label className="flex items-center gap-1 whitespace-nowrap text-xs text-ink-secondary">
        <input
          type="checkbox"
          checked={isOverride}
          onChange={(e) => setIsOverride(e.target.checked)}
        />
        this month only
      </label>
      <Button size="sm" disabled={submitting} onClick={handleSave}>
        Set
      </Button>
    </span>
  );
}

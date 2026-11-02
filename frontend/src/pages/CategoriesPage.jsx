import { ChevronDown, HandCoins } from "lucide-react";
import { useEffect, useState } from "react";
import { createCategory, deleteCategory, listCategories, updateCategory } from "../api/categories";
import { listTabs } from "../api/tabs";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { useToast } from "../components/ui/Toast";
import { buildCategoryTree } from "../lib/categoryTree";
import { cn } from "../lib/cn";
import { formatMoney } from "../lib/money";
import { tabSentence, TONE_CLASS } from "../lib/tabs";
import { budgetSummary, formatDue } from "../lib/yearlyBudgets";

export function CategoriesPage() {
  const [categories, setCategories] = useState([]);
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

  function reload() {
    // Tab balances come along, since re-parenting can make a category a tab.
    listTabs()
      .then((tabs) => setTabBalances(Object.fromEntries(tabs.map((t) => [t.id, t.balance_cents]))))
      .catch(() => setTabBalances({}));
    return listCategories().then(setCategories);
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleAdd(values) {
    await createCategory(values.name, values.parent, values.is_tab_group);
    toast.success("Category created.");
    await reload();
  }

  async function handleSave(id, values) {
    await updateCategory(id, values);
    toast.success("Category updated.");
    setEditingId(null);
    await reload();
  }

  async function handleDelete(id) {
    setPending(id, true);
    try {
      await deleteCategory(id);
      toast.success("Category deleted.");
      await reload();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setPending(id, false);
    }
  }

  const row = (category) => (
    <CategoryRow
      category={category}
      categories={categories}
      tabBalance={tabBalances[category.id]}
      editing={editingId === category.id}
      disabled={pendingIds.has(category.id)}
      onEdit={() => setEditingId(category.id)}
      onCancelEdit={() => setEditingId(null)}
      onSave={(values) => handleSave(category.id, values)}
      onDelete={() => handleDelete(category.id)}
    />
  );
  const tree = buildCategoryTree(categories);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title="Categories" />
      <Panel>
        <div className="flex flex-col gap-4">
          <CategoryForm categories={categories} onSubmit={handleAdd} submitLabel="Add category" />

          <ul className="flex flex-col gap-3">
            {tree.map((parent) => (
              <li key={parent.id} className="flex flex-col gap-2">
                {row(parent)}
                {parent.subcategories.length > 0 && (
                  <ul className="ml-6 flex flex-col gap-2 border-l border-border pl-4">
                    {parent.subcategories.map((sub) => (
                      <li key={sub.id}>{row(sub)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
            {tree.length === 0 && (
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

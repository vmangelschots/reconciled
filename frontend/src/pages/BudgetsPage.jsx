import { useEffect, useState } from "react";
import { getBudgetSummary } from "../api/budgets";
import {
  createCategory,
  deleteCategory,
  listCategories,
  setCategoryLimit,
  updateCategory,
} from "../api/categories";
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
    await createCategory(values.name, values.parent);
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

function CategoryRow({ category, categories, editing, disabled, onEdit, onCancelEdit, onSave, onDelete }) {
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
      <span className="flex-1 text-sm text-ink-primary">{category.name}</span>
      <Button variant="outline" size="sm" disabled={disabled} onClick={onEdit}>
        Rename
      </Button>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}

function CategoryForm({ initialValues, categories, onSubmit, onCancel, submitLabel }) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [parentId, setParentId] = useState(initialValues?.parent ?? null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  // Only top-level categories are valid parents (two levels max), and a
  // category can't be its own parent.
  const parentCandidates = categories.filter(
    (c) => c.parent == null && (!initialValues || c.id !== initialValues.id),
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ name, parent: parentId });
      if (!initialValues) {
        setName("");
        setParentId(null);
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
      <Button type="submit" disabled={submitting}>
        {submitLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
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

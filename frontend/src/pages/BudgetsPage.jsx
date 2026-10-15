import { useEffect, useState } from "react";
import { getBudgetSummary } from "../api/budgets";
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  setCategoryLimit,
} from "../api/categories";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { cn } from "../lib/cn";

function formatCents(cents) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function BudgetsPage() {
  const [categories, setCategories] = useState([]);
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const toast = useToast();

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

  async function handleAddCategory(event) {
    event.preventDefault();
    try {
      await createCategory(newCategoryName);
      toast.success("Category created.");
      setNewCategoryName("");
      await reloadCategories();
      await reloadSummary();
    } catch (e) {
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    }
  }

  async function handleRename(id, name) {
    await renameCategory(id, name);
    toast.success("Category renamed.");
    setEditingId(null);
    await reloadCategories();
    await reloadSummary();
  }

  async function handleDelete(id) {
    try {
      await deleteCategory(id);
      toast.success("Category deleted.");
      await reloadCategories();
      await reloadSummary();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
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

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink-primary">Budgets</h1>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleAddCategory} className="flex items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-category">New category</Label>
              <Input
                id="new-category"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                required
              />
            </div>
            <Button type="submit">Add category</Button>
          </form>

          <ul className="flex flex-col gap-2">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                {editingId === c.id ? (
                  <RenameForm
                    initialName={c.name}
                    onSave={(name) => handleRename(c.id, name)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <span className="flex-1 text-sm text-ink-primary">{c.name}</span>
                    <Button variant="outline" size="sm" onClick={() => setEditingId(c.id)}>
                      Rename
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                      Delete
                    </Button>
                  </>
                )}
              </li>
            ))}
            {categories.length === 0 && (
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
              {summary.categories.map((row) => (
                <TableRow key={row.category_id}>
                  <TableCell>{row.category_name}</TableCell>
                  <TableCell>{formatCents(row.limit_cents)}</TableCell>
                  <TableCell>{formatCents(row.spent_cents)}</TableCell>
                  <TableCell>{formatCents(row.remaining_cents)}</TableCell>
                  <TableCell className={cn(row.over_limit && "font-semibold text-critical")}>
                    {row.limit_cents == null ? "No limit" : row.over_limit ? "Over limit" : "OK"}
                  </TableCell>
                  <TableCell>
                    <LimitForm onSave={(amount, isOverride) => handleSetLimit(row.category_id, amount, isOverride)} />
                  </TableCell>
                </TableRow>
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

function RenameForm({ initialName, onSave, onCancel }) {
  const [name, setName] = useState(initialName);
  return (
    <span className="flex flex-1 items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
      <Button size="sm" onClick={() => onSave(name)}>
        Save
      </Button>
      <Button variant="outline" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </span>
  );
}

function LimitForm({ onSave }) {
  const [amount, setAmount] = useState("");
  const [isOverride, setIsOverride] = useState(false);
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
      <Button size="sm" onClick={() => onSave(amount, isOverride)}>
        Set
      </Button>
    </span>
  );
}

import { useEffect, useState } from "react";
import { getBudgetSummary } from "../api/budgets";
import {
  createCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  setCategoryLimit,
} from "../api/categories";

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
  const [error, setError] = useState(null);

  function reloadCategories() {
    return listCategories().then(setCategories);
  }

  function reloadSummary() {
    return getBudgetSummary(month).then(setSummary).catch((e) => setError(e.message));
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
    setError(null);
    try {
      await createCategory(newCategoryName);
      setNewCategoryName("");
      await reloadCategories();
      await reloadSummary();
    } catch (e) {
      setError(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    }
  }

  async function handleRename(id, name) {
    await renameCategory(id, name);
    setEditingId(null);
    await reloadCategories();
    await reloadSummary();
  }

  async function handleDelete(id) {
    setError(null);
    try {
      await deleteCategory(id);
      await reloadCategories();
      await reloadSummary();
    } catch (e) {
      setError(e.data?.detail ?? e.message);
    }
  }

  async function handleSetLimit(id, amountText, isOverride) {
    await setCategoryLimit(id, {
      month: isOverride ? month : null,
      limit_cents: Math.round(parseFloat(amountText || "0") * 100),
    });
    await reloadSummary();
  }

  return (
    <section>
      <h1>Budgets</h1>

      <h2>Categories</h2>
      <form onSubmit={handleAddCategory} className="account-form">
        <label>
          New category
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            required
          />
        </label>
        <button type="submit">Add category</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <ul className="category-list">
        {categories.map((c) => (
          <li key={c.id}>
            {editingId === c.id ? (
              <RenameForm
                initialName={c.name}
                onSave={(name) => handleRename(c.id, name)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <>
                {c.name}
                <button type="button" onClick={() => setEditingId(c.id)}>
                  Rename
                </button>
                <button type="button" onClick={() => handleDelete(c.id)}>
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
        {categories.length === 0 && <li>No categories yet - add one above.</li>}
      </ul>

      <h2>Monthly summary</h2>
      <label>
        Month
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </label>

      {summary && (
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Limit</th>
              <th>Spent</th>
              <th>Remaining</th>
              <th>Status</th>
              <th>Set limit</th>
            </tr>
          </thead>
          <tbody>
            {summary.categories.map((row) => (
              <tr key={row.category_id}>
                <td>{row.category_name}</td>
                <td>{formatCents(row.limit_cents)}</td>
                <td>{formatCents(row.spent_cents)}</td>
                <td>{formatCents(row.remaining_cents)}</td>
                <td className={row.over_limit ? "over-limit" : undefined}>
                  {row.limit_cents == null ? "No limit" : row.over_limit ? "Over limit" : "OK"}
                </td>
                <td>
                  <LimitForm onSave={(amount, isOverride) => handleSetLimit(row.category_id, amount, isOverride)} />
                </td>
              </tr>
            ))}
            <tr>
              <td>Uncategorized</td>
              <td>—</td>
              <td>{formatCents(summary.uncategorized_spent_cents)}</td>
              <td>—</td>
              <td>—</td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

function RenameForm({ initialName, onSave, onCancel }) {
  const [name, setName] = useState(initialName);
  return (
    <span>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button type="button" onClick={() => onSave(name)}>
        Save
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </span>
  );
}

function LimitForm({ onSave }) {
  const [amount, setAmount] = useState("");
  const [isOverride, setIsOverride] = useState(false);
  return (
    <span className="limit-form">
      <input
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="amount"
      />
      <label>
        <input
          type="checkbox"
          checked={isOverride}
          onChange={(e) => setIsOverride(e.target.checked)}
        />
        this month only
      </label>
      <button type="button" onClick={() => onSave(amount, isOverride)}>
        Set
      </button>
    </span>
  );
}

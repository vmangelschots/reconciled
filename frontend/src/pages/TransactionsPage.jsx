import { useEffect, useState } from "react";
import { listAccounts } from "../api/accounts";
import { listCategories } from "../api/categories";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "../api/transactions";

function formatCents(cents) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

export function TransactionsPage() {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accountId, setAccountId] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", category: "", search: "" });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([listAccounts(), listCategories()]).then(([accts, cats]) => {
      setAccounts(accts);
      setCategories(cats);
      if (accts.length > 0) setAccountId(accts[0].id);
    });
  }, []);

  function reload() {
    if (!accountId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return listTransactions({
      account: accountId,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      category: filters.category,
      search: filters.search,
    })
      .then(setTransactions)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, filters]);

  async function handleCreate(values) {
    await createTransaction({ ...values, account: accountId });
    await reload();
  }

  async function handleSave(id, values) {
    await updateTransaction(id, values);
    setEditingId(null);
    await reload();
  }

  async function handleDelete(id) {
    await deleteTransaction(id);
    await reload();
  }

  function categoryName(id) {
    return categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  }

  if (accounts.length === 0) {
    return (
      <section>
        <h1>Transactions</h1>
        <p>Add an account first.</p>
      </section>
    );
  }

  return (
    <section>
      <h1>Transactions</h1>

      <label>
        Account
        <select value={accountId ?? ""} onChange={(e) => setAccountId(Number(e.target.value))}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="transaction-filters">
        <legend>Filters</legend>
        <label>
          From
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
          />
        </label>
        <label>
          Category
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          >
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </label>
      </fieldset>

      <h2>Add transaction</h2>
      <TransactionForm categories={categories} onSubmit={handleCreate} submitLabel="Add transaction" />

      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Payee</th>
              <th>Category</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) =>
              editingId === t.id ? (
                <tr key={t.id}>
                  <td colSpan={5}>
                    <TransactionForm
                      initialValues={t}
                      categories={categories}
                      submitLabel="Save"
                      onSubmit={(values) => handleSave(t.id, values)}
                      onCancel={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.payee}</td>
                  <td>{categoryName(t.category)}</td>
                  <td>{formatCents(t.amount_cents)}</td>
                  <td>
                    <button type="button" onClick={() => setEditingId(t.id)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(t.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ),
            )}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={5}>No transactions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}

function TransactionForm({ initialValues, categories, onSubmit, onCancel, submitLabel }) {
  const [date, setDate] = useState(initialValues?.date ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(
    initialValues ? (initialValues.amount_cents / 100).toString() : "",
  );
  const [payee, setPayee] = useState(initialValues?.payee ?? "");
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        date,
        amount_cents: Math.round(parseFloat(amount || "0") * 100),
        payee,
        category: category || null,
        notes,
      });
      if (!initialValues) {
        setAmount("");
        setPayee("");
        setCategory("");
        setNotes("");
      }
    } catch (e) {
      setError(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="transaction-form">
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Amount
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </label>
      <label>
        Payee
        <input value={payee} onChange={(e) => setPayee(e.target.value)} required />
      </label>
      <label>
        Category
        <select value={category ?? ""} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Notes
        <input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  );
}

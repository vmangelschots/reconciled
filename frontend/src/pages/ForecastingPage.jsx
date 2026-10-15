import { useEffect, useState } from "react";
import { listAccounts } from "../api/accounts";
import { listCategories } from "../api/categories";
import {
  createRecurringTransaction,
  deleteRecurringTransaction,
  getForecast,
  listRecurringTransactions,
  updateRecurringTransaction,
} from "../api/forecasting";
import { ForecastChart } from "../components/ForecastChart";

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const HORIZON_PRESETS = [
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "1 year", value: 365 },
];

function formatCents(cents) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function ForecastingPage() {
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accountId, setAccountId] = useState(null);
  const [recurring, setRecurring] = useState([]);
  const [horizonDays, setHorizonDays] = useState(90);
  const [forecast, setForecast] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([listAccounts(), listCategories()]).then(([accts, cats]) => {
      setAccounts(accts);
      setCategories(cats);
      if (accts.length > 0) setAccountId(accts[0].id);
    });
  }, []);

  function reloadRecurring() {
    if (!accountId) return;
    return listRecurringTransactions(accountId).then(setRecurring);
  }

  function reloadForecast() {
    if (!accountId) return;
    return getForecast(accountId, horizonDays).then(setForecast).catch((e) => setError(e.message));
  }

  useEffect(() => {
    reloadRecurring();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    reloadForecast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, horizonDays]);

  async function handleCreate(values) {
    await createRecurringTransaction({ ...values, account: accountId });
    await Promise.all([reloadRecurring(), reloadForecast()]);
  }

  async function handleSave(id, values) {
    await updateRecurringTransaction(id, values);
    setEditingId(null);
    await Promise.all([reloadRecurring(), reloadForecast()]);
  }

  async function handleDelete(id) {
    await deleteRecurringTransaction(id);
    await Promise.all([reloadRecurring(), reloadForecast()]);
  }

  function categoryName(id) {
    return categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  }

  if (accounts.length === 0) {
    return (
      <section>
        <h1>Forecast</h1>
        <p>Add an account first.</p>
      </section>
    );
  }

  return (
    <section>
      <h1>Forecast</h1>

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

      <h2>Recurring transactions</h2>
      <RecurringForm categories={categories} onSubmit={handleCreate} submitLabel="Add recurring transaction" />
      <table>
        <thead>
          <tr>
            <th>Payee</th>
            <th>Amount</th>
            <th>Frequency</th>
            <th>Start</th>
            <th>End</th>
            <th>Category</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {recurring.map((r) =>
            editingId === r.id ? (
              <tr key={r.id}>
                <td colSpan={7}>
                  <RecurringForm
                    initialValues={r}
                    categories={categories}
                    submitLabel="Save"
                    onSubmit={(values) => handleSave(r.id, values)}
                    onCancel={() => setEditingId(null)}
                  />
                </td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td>{r.payee}</td>
                <td>{formatCents(r.amount_cents)}</td>
                <td>{FREQUENCIES.find((f) => f.value === r.frequency)?.label}</td>
                <td>{r.start_date}</td>
                <td>{r.end_date ?? "—"}</td>
                <td>{categoryName(r.category)}</td>
                <td>
                  <button type="button" onClick={() => setEditingId(r.id)}>
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(r.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ),
          )}
          {recurring.length === 0 && (
            <tr>
              <td colSpan={7}>No recurring transactions yet.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h2>Projected balance</h2>
      <div className="horizon-presets">
        {HORIZON_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={horizonDays === preset.value ? "active" : undefined}
            onClick={() => setHorizonDays(preset.value)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      {forecast && (
        <>
          <ForecastChart points={forecast.points} />
          <h3>Upcoming scheduled items</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Payee</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {forecast.occurrences.map((o, i) => (
                <tr key={`${o.recurring_transaction_id}-${o.date}-${i}`}>
                  <td>{o.date}</td>
                  <td>{o.payee}</td>
                  <td>{formatCents(o.amount_cents)}</td>
                </tr>
              ))}
              {forecast.occurrences.length === 0 && (
                <tr>
                  <td colSpan={3}>Nothing scheduled in this window.</td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function RecurringForm({ initialValues, categories, onSubmit, onCancel, submitLabel }) {
  const [payee, setPayee] = useState(initialValues?.payee ?? "");
  const [amount, setAmount] = useState(
    initialValues ? (initialValues.amount_cents / 100).toString() : "",
  );
  const [frequency, setFrequency] = useState(initialValues?.frequency ?? "monthly");
  const [startDate, setStartDate] = useState(
    initialValues?.start_date ?? new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(initialValues?.end_date ?? "");
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        payee,
        amount_cents: Math.round(parseFloat(amount || "0") * 100),
        frequency,
        start_date: startDate,
        end_date: endDate || null,
        category: category || null,
      });
      if (!initialValues) {
        setPayee("");
        setAmount("");
        setEndDate("");
      }
    } catch (e) {
      setError(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="account-form">
      <label>
        Payee
        <input value={payee} onChange={(e) => setPayee(e.target.value)} required />
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
        Frequency
        <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
          {FREQUENCIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Start date
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      </label>
      <label>
        End date (optional)
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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

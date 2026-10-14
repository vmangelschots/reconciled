import { useEffect, useState } from "react";
import {
  ACCOUNT_TYPES,
  archiveAccount,
  createAccount,
  listAccounts,
  updateAccount,
} from "../api/accounts";

function formatCents(cents) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function typeLabel(value) {
  return ACCOUNT_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [editingId, setEditingId] = useState(null);

  function reload() {
    setLoading(true);
    return listAccounts()
      .then(setAccounts)
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleCreate(values) {
    await createAccount(values);
    await reload();
  }

  async function handleSave(id, values) {
    await updateAccount(id, values);
    setEditingId(null);
    await reload();
  }

  async function handleArchive(id) {
    await archiveAccount(id);
    await reload();
  }

  return (
    <section>
      <h1>Accounts</h1>

      <h2>Add account</h2>
      <AccountForm onSubmit={handleCreate} submitLabel="Add account" />

      {loadError && <p role="alert">{loadError}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Balance</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) =>
              editingId === account.id ? (
                <tr key={account.id}>
                  <td colSpan={4}>
                    <AccountForm
                      initialValues={account}
                      submitLabel="Save"
                      onSubmit={(values) => handleSave(account.id, values)}
                      onCancel={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={account.id}>
                  <td>{account.name}</td>
                  <td>{typeLabel(account.account_type)}</td>
                  <td>{formatCents(account.current_balance_cents)}</td>
                  <td>
                    <button type="button" onClick={() => setEditingId(account.id)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleArchive(account.id)}>
                      Archive
                    </button>
                  </td>
                </tr>
              ),
            )}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={4}>No accounts yet - add one above.</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}

function AccountForm({ initialValues, onSubmit, onCancel, submitLabel }) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [accountType, setAccountType] = useState(initialValues?.account_type ?? "checking");
  const [startingBalance, setStartingBalance] = useState(
    initialValues ? (initialValues.starting_balance_cents / 100).toString() : "0",
  );
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name,
        account_type: accountType,
        starting_balance_cents: Math.round(parseFloat(startingBalance || "0") * 100),
      });
      if (!initialValues) {
        setName("");
        setStartingBalance("0");
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
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Type
        <select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Starting balance
        <input
          type="number"
          step="0.01"
          value={startingBalance}
          onChange={(e) => setStartingBalance(e.target.value)}
        />
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

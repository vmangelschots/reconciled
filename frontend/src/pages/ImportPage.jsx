import { useEffect, useState } from "react";
import { listAccounts } from "../api/accounts";
import { commitImport, mapCsvColumns, uploadImportFile } from "../api/imports";

function formatCents(cents) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

const CSV_FIELDS = ["date", "amount", "description", "payee"];

export function ImportPage() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(null);
  const [file, setFile] = useState(null);
  const [session, setSession] = useState(null);
  const [mapping, setMapping] = useState({ date: "", amount: "", description: "", payee: "" });
  const [selected, setSelected] = useState(new Set());
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listAccounts().then((accts) => {
      setAccounts(accts);
      if (accts.length > 0) setAccountId(accts[0].id);
    });
  }, []);

  function selectNonDuplicates(candidates) {
    setSelected(new Set(candidates.filter((c) => !c.is_duplicate).map((c) => c.index)));
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await uploadImportFile(accountId, file);
      setSession(data);
      if (data.candidates?.length) selectNonDuplicates(data.candidates);
    } catch (e) {
      setError(e.data?.detail ?? e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMap(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await mapCsvColumns(session.id, mapping);
      setSession({ ...session, ...data });
      selectNonDuplicates(data.candidates);
    } catch (e) {
      setError(e.data?.detail ?? e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function toggle(index) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleCommit() {
    setError(null);
    setSubmitting(true);
    try {
      const data = await commitImport(session.id, [...selected]);
      setResult(data);
    } catch (e) {
      setError(e.data?.detail ?? e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setSession(null);
    setFile(null);
    setSelected(new Set());
    setResult(null);
    setError(null);
  }

  if (result) {
    return (
      <section>
        <h1>Import</h1>
        <p>Created {result.created_count} transaction(s).</p>
        <button type="button" onClick={startOver}>
          Import another file
        </button>
      </section>
    );
  }

  if (session?.candidates?.length) {
    return (
      <section>
        <h1>Import</h1>
        <h2>Preview</h2>
        {error && <p role="alert">{error}</p>}
        <table>
          <thead>
            <tr>
              <th />
              <th>Date</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Duplicate?</th>
            </tr>
          </thead>
          <tbody>
            {session.candidates.map((c) => (
              <tr key={c.index}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(c.index)}
                    onChange={() => toggle(c.index)}
                  />
                </td>
                <td>{c.date}</td>
                <td>{c.description}</td>
                <td>{formatCents(c.amount_cents)}</td>
                <td>{c.is_duplicate ? "Likely duplicate" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={handleCommit} disabled={submitting}>
          Confirm import ({selected.size} selected)
        </button>
        <button type="button" onClick={startOver}>
          Cancel
        </button>
      </section>
    );
  }

  if (session?.file_format === "csv") {
    return (
      <section>
        <h1>Import</h1>
        <h2>Map columns</h2>
        {error && <p role="alert">{error}</p>}
        <form onSubmit={handleMap} className="account-form">
          {CSV_FIELDS.map((field) => (
            <label key={field}>
              {field}
              <select
                value={mapping[field]}
                onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
              >
                <option value="">—</option>
                {session.columns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button type="submit" disabled={submitting}>
            Parse
          </button>
          <button type="button" onClick={startOver}>
            Cancel
          </button>
        </form>
      </section>
    );
  }

  return (
    <section>
      <h1>Import</h1>
      {accounts.length === 0 ? (
        <p>Add an account first.</p>
      ) : (
        <form onSubmit={handleUpload} className="account-form">
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
          <label>
            File (.csv or .ofx)
            <input
              type="file"
              accept=".csv,.ofx"
              onChange={(e) => setFile(e.target.files[0])}
              required
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={submitting || !file}>
            Upload
          </button>
        </form>
      )}
    </section>
  );
}

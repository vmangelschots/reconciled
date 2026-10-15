import { useEffect, useState } from "react";
import { listAccounts } from "../api/accounts";
import { commitImport, mapCsvColumns, uploadImportFile } from "../api/imports";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Label } from "../components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";

function formatCents(cents) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

const CSV_FIELDS = ["date", "amount", "description", "payee"];
const UNMAPPED = "none";

export function ImportPage() {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(null);
  const [file, setFile] = useState(null);
  const [session, setSession] = useState(null);
  const [mapping, setMapping] = useState({
    date: UNMAPPED,
    amount: UNMAPPED,
    description: UNMAPPED,
    payee: UNMAPPED,
  });
  const [selected, setSelected] = useState(new Set());
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

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
    setSubmitting(true);
    try {
      const data = await uploadImportFile(accountId, file);
      setSession(data);
      if (data.candidates?.length) selectNonDuplicates(data.candidates);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMap(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const mappingPayload = Object.fromEntries(
        Object.entries(mapping).map(([field, col]) => [field, col === UNMAPPED ? "" : col]),
      );
      const data = await mapCsvColumns(session.id, mappingPayload);
      setSession({ ...session, ...data });
      selectNonDuplicates(data.candidates);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
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
    setSubmitting(true);
    try {
      const data = await commitImport(session.id, [...selected]);
      setResult(data);
      toast.success(`Created ${data.created_count} transaction(s).`);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setSession(null);
    setFile(null);
    setSelected(new Set());
    setResult(null);
  }

  if (result) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-ink-primary">Import</h1>
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <p className="text-sm text-ink-primary">Created {result.created_count} transaction(s).</p>
            <Button onClick={startOver} className="self-start">
              Import another file
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (session?.candidates?.length) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-ink-primary">Import</h1>
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Duplicate?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.candidates.map((c) => (
                  <TableRow key={c.index}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(c.index)}
                        onChange={() => toggle(c.index)}
                      />
                    </TableCell>
                    <TableCell>{c.date}</TableCell>
                    <TableCell>{c.description}</TableCell>
                    <TableCell>{formatCents(c.amount_cents)}</TableCell>
                    <TableCell className={c.is_duplicate ? "text-ink-muted" : undefined}>
                      {c.is_duplicate ? "Likely duplicate" : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex gap-2">
              <Button onClick={handleCommit} disabled={submitting}>
                Confirm import ({selected.size} selected)
              </Button>
              <Button variant="outline" onClick={startOver}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (session?.file_format === "csv") {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-ink-primary">Import</h1>
        <Card>
          <CardHeader>
            <CardTitle>Map columns</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleMap} className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-4">
                {CSV_FIELDS.map((field) => (
                  <div key={field} className="flex flex-col gap-1.5">
                    <Label className="capitalize">{field}</Label>
                    <Select
                      value={mapping[field]}
                      onValueChange={(v) => setMapping({ ...mapping, [field]: v })}
                    >
                      <SelectTrigger className="w-44" aria-label={field}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNMAPPED}>—</SelectItem>
                        {session.columns.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  Parse
                </Button>
                <Button type="button" variant="outline" onClick={startOver}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-ink-primary">Import</h1>
      {accounts.length === 0 ? (
        <p className="text-sm text-ink-secondary">Add an account first.</p>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Account</Label>
                <Select value={accountId != null ? String(accountId) : ""} onValueChange={(v) => setAccountId(Number(v))}>
                  <SelectTrigger className="w-56" aria-label="Account">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="import-file">File (.csv or .ofx)</Label>
                <input
                  id="import-file"
                  type="file"
                  accept=".csv,.ofx"
                  onChange={(e) => setFile(e.target.files[0])}
                  required
                  className="text-sm text-ink-secondary file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
                />
              </div>
              <Button type="submit" disabled={submitting || !file}>
                Upload
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

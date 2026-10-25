import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { useAccounts } from "../accounts/AccountsContext";
import { listAccounts } from "../api/accounts";
import { assignProducts, commitImport, mapCsvColumns, uploadImportFile } from "../api/imports";
import { Button, buttonVariants } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Label } from "../components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { useAfterDelay } from "../hooks/useAfterDelay";
import { aiFailed, aiOutcomeLines, sourceSplit } from "../lib/categorizeOutcome";
import { formatShortDate } from "../lib/dates";
import { Amount } from "../components/ui/Amount";
import { PageHeader } from "../components/ui/PageHeader";
import { useReviewCount } from "../review/ReviewCountContext";

const CSV_FIELDS = ["date", "amount", "description", "payee"];
const UNMAPPED = "none";
// The Accounts step's "Don't import" choice (sent as null).
const SKIP = "skip";
// No default - the user must choose explicitly (design.md: guessing the
// date format is exactly the bug this change fixes, so it isn't
// reintroduced here as a pre-selected "sensible" default).
const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY", "MM-DD-YYYY", "DD.MM.YYYY"];
// When a running commit starts saying the AI step can take a while.
const SLOW_HINT_MS = 4000;

// The Accounts step's Select value for a Product: "" while unchosen.
function productChoice(productAccounts, product) {
  if (!(product in productAccounts)) return "";
  return productAccounts[product] === null ? SKIP : String(productAccounts[product]);
}

// The Match column: a pocket move names the other side's account with the
// ledger's transfer arrows.
function matchLabel(c) {
  if (c.pocket_pair) return `${c.amount_cents < 0 ? "→" : "←"} ${c.pocket_pair.account_name}`;
  if (c.transfer_match) return `Matches transfer from ${c.transfer_match.counterpart_account_name}`;
  return c.is_duplicate ? "Likely duplicate" : "";
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// The summary's lines: what was created, how many got a category (split by
// source), then anything to say about the AI step. A matched transfer line
// updates the counterpart the app created instead of adding a transaction,
// so it is reported separately. Guessed categories are reviewed on the
// Review page, never here; the summary only says how many there are.
function importSummary({
  created_count,
  confirmed_transfer_count = 0,
  categorized_count = 0,
  categorized_by_source,
  ai,
}) {
  let created = `Created ${plural(created_count, "transaction", "transactions")}.`;
  if (confirmed_transfer_count > 0) {
    created += ` Confirmed ${plural(confirmed_transfer_count, "transfer", "transfers")}.`;
  }
  const lines = [created];
  if (categorized_count > 0) {
    const bySource = categorized_by_source ?? { history: categorized_count, ai: 0 };
    lines.push(`${categorized_count} got a category (${sourceSplit(bySource)}).`);
  }
  return [...lines, ...aiOutcomeLines(ai)];
}

export function ImportPage() {
  const { refresh: refreshReviewCount } = useReviewCount();
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState(null);
  const [searchParams] = useSearchParams();
  const { lastOpenedId } = useAccounts();
  const [file, setFile] = useState(null);
  const [session, setSession] = useState(null);
  const [mapping, setMapping] = useState({
    date: UNMAPPED,
    amount: UNMAPPED,
    description: UNMAPPED,
    payee: UNMAPPED,
  });
  const [dateFormat, setDateFormat] = useState("");
  const [productAccounts, setProductAccounts] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const slowCommit = useAfterDelay(committing && Boolean(session?.ai_enabled), SLOW_HINT_MS);
  const toast = useToast();

  useEffect(() => {
    listAccounts().then((accts) => {
      setAccounts(accts);
      // ?account= (from a stale-import reminder or an empty ledger) wins,
      // then the account last opened under Transactions, then the first.
      const wanted = Number(searchParams.get("account"));
      const start = accts.find((a) => a.id === wanted) ?? accts.find((a) => a.id === lastOpenedId) ?? accts[0];
      if (start) setAccountId(start.id);
    });
    // The starting account is chosen once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (data.products) setProductAccounts(data.product_accounts ?? {});
      if (data.saved_mapping) {
        // This account's last mapping, still valid for this file's columns.
        setMapping(
          Object.fromEntries(CSV_FIELDS.map((field) => [field, data.saved_mapping[field] || UNMAPPED])),
        );
        setDateFormat(data.saved_mapping.date_format ?? "");
      }
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
      const mappingPayload = {
        ...Object.fromEntries(
          Object.entries(mapping).map(([field, col]) => [field, col === UNMAPPED ? "" : col]),
        ),
        date_format: dateFormat,
      };
      const data = await mapCsvColumns(session.id, mappingPayload);
      setSession({ ...session, ...data });
      selectNonDuplicates(data.candidates);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssign(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const data = await assignProducts(session.id, productAccounts);
      // Products answered: on to the preview (or "nothing to import").
      setSession({ ...session, ...data, products: undefined });
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
    setCommitting(true);
    try {
      const data = await commitImport(session.id, [...selected]);
      setResult(data);
      const summary = importSummary(data).join(" ");
      if (aiFailed(data.ai)) toast.error(summary);
      else toast.success(summary);
      // The commit may have added guesses, so the nav's Review count is stale.
      refreshReviewCount();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setSubmitting(false);
      setCommitting(false);
    }
  }

  function startOver() {
    setSession(null);
    setFile(null);
    setProductAccounts({});
    setMapping({ date: UNMAPPED, amount: UNMAPPED, description: UNMAPPED, payee: UNMAPPED });
    setDateFormat("");
    setSelected(new Set());
    setResult(null);
  }

  if (result) {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title="Import" />
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex flex-col gap-1 text-sm">
              {importSummary(result).map((line, index) => (
                <p key={line} className={index === 0 ? "text-ink-primary" : "text-ink-secondary"}>
                  {line}
                </p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {result.categorized_count > 0 && (
                <Link to="/review" className={buttonVariants()}>
                  Review {result.categorized_count} {result.categorized_count === 1 ? "guess" : "guesses"}
                </Link>
              )}
              <Button onClick={startOver} variant={result.categorized_count > 0 ? "outline" : "default"}>
                Import another file
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (session?.candidates?.length) {
    // An Account column only when the lines go to more than one account.
    const severalAccounts = new Set(session.candidates.map((c) => c.account_id)).size > 1;
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title="Import" />
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            {session.preset_label && (
              <p className="text-sm text-ink-secondary">Recognized as a {session.preset_label} export.</p>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Date</TableHead>
                  {severalAccounts && <TableHead>Account</TableHead>}
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Match</TableHead>
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
                        disabled={committing}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatShortDate(c.date)}</TableCell>
                    {severalAccounts && <TableCell className="whitespace-nowrap">{c.account_name}</TableCell>}
                    <TableCell>{c.description}</TableCell>
                    <TableCell className="text-right">
                      <Amount cents={c.amount_cents} signed />
                    </TableCell>
                    <TableCell className={c.is_duplicate ? "text-ink-muted" : undefined}>{matchLabel(c)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Button onClick={handleCommit} disabled={submitting} className="min-w-[11rem]">
                  {committing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Importing…
                    </>
                  ) : (
                    `Confirm import (${selected.size} selected)`
                  )}
                </Button>
                <Button variant="outline" onClick={startOver} disabled={committing}>
                  Cancel
                </Button>
              </div>
              {slowCommit && (
                <p className="text-xs text-ink-secondary">Guessing categories, this can take up to a minute.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (session?.products) {
    const activeAccounts = accounts.filter((a) => !a.archived);
    const allChosen = session.products.every((product) => product in productAccounts);
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title="Import" />
        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <p className="text-sm text-ink-secondary">
              Recognized as a {session.preset_label} export. Choose where each part of it goes.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAssign} className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-4">
                {session.products.map((product) => (
                  <div key={product} className="flex flex-col gap-1.5">
                    <Label>{product}</Label>
                    <Select
                      value={productChoice(productAccounts, product)}
                      onValueChange={(v) =>
                        setProductAccounts({ ...productAccounts, [product]: v === SKIP ? null : Number(v) })
                      }
                    >
                      <SelectTrigger className="w-56" aria-label={product}>
                        <SelectValue placeholder="Choose an account" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeAccounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={SKIP}>Don't import</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={submitting || !allChosen}>
                  Continue
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

  if (session?.preset) {
    // A recognized export whose every line was left out (e.g. only
    // pending Revolut rows, or every Product skipped).
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title="Import" />
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <p className="text-sm text-ink-secondary">
              Recognized as a {session.preset_label} export, but there is nothing in it to import.
            </p>
            <div>
              <Button onClick={startOver}>Import another file</Button>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (session?.file_format === "csv") {
    return (
      <section className="flex flex-col gap-4">
        <PageHeader title="Import" />
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
                <div className="flex flex-col gap-1.5">
                  <Label>Date format</Label>
                  <Select value={dateFormat} onValueChange={setDateFormat}>
                    <SelectTrigger className="w-44" aria-label="Date format">
                      <SelectValue placeholder="Choose a format" />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_FORMATS.map((fmt) => (
                        <SelectItem key={fmt} value={fmt}>
                          {fmt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
      <PageHeader title="Import" />
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
                  className="text-sm text-ink-secondary file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-on-accent hover:file:opacity-90"
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

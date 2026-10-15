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
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { cn } from "../lib/cn";

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

const UNCATEGORIZED = "uncategorized";

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
  const toast = useToast();

  useEffect(() => {
    Promise.all([listAccounts(), listCategories()]).then(([accts, cats]) => {
      setAccounts(accts);
      setCategories(cats);
      if (accts.length > 0) setAccountId(accts[0].id);
    });
  }, []);

  function reloadRecurring() {
    if (!accountId) return undefined;
    return listRecurringTransactions(accountId).then(setRecurring);
  }

  function reloadForecast() {
    if (!accountId) return undefined;
    return getForecast(accountId, horizonDays).then(setForecast).catch((e) => toast.error(e.message));
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
    toast.success("Recurring transaction added.");
    await Promise.all([reloadRecurring(), reloadForecast()]);
  }

  async function handleSave(id, values) {
    await updateRecurringTransaction(id, values);
    toast.success("Recurring transaction updated.");
    setEditingId(null);
    await Promise.all([reloadRecurring(), reloadForecast()]);
  }

  async function handleDelete(id) {
    await deleteRecurringTransaction(id);
    toast.success("Recurring transaction deleted.");
    await Promise.all([reloadRecurring(), reloadForecast()]);
  }

  function categoryName(id) {
    return categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  }

  if (accounts.length === 0) {
    return (
      <section>
        <h1 className="text-xl font-semibold text-ink-primary">Forecast</h1>
        <p className="mt-2 text-sm text-ink-secondary">Add an account first.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink-primary">Forecast</h1>

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

      <Card>
        <CardHeader>
          <CardTitle>Recurring transactions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <RecurringForm categories={categories} onSubmit={handleCreate} submitLabel="Add recurring transaction" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payee</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Category</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recurring.map((r) =>
                editingId === r.id ? (
                  <TableRow key={r.id}>
                    <TableCell colSpan={7}>
                      <RecurringForm
                        initialValues={r}
                        categories={categories}
                        submitLabel="Save"
                        onSubmit={(values) => handleSave(r.id, values)}
                        onCancel={() => setEditingId(null)}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={r.id}>
                    <TableCell>{r.payee}</TableCell>
                    <TableCell>{formatCents(r.amount_cents)}</TableCell>
                    <TableCell>{FREQUENCIES.find((f) => f.value === r.frequency)?.label}</TableCell>
                    <TableCell>{r.start_date}</TableCell>
                    <TableCell>{r.end_date ?? "—"}</TableCell>
                    <TableCell>{categoryName(r.category)}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditingId(r.id)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                ),
              )}
              {recurring.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-ink-secondary">
                    No recurring transactions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink-primary">Projected balance</h2>
          <div className="flex gap-2">
            {HORIZON_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                type="button"
                variant={horizonDays === preset.value ? "default" : "outline"}
                size="sm"
                onClick={() => setHorizonDays(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {forecast && (
          <>
            <ForecastChart points={forecast.points} />
            <h3 className="text-sm font-semibold text-ink-primary">Upcoming scheduled items</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecast.occurrences.map((o, i) => (
                  <TableRow key={`${o.recurring_transaction_id}-${o.date}-${i}`}>
                    <TableCell>{o.date}</TableCell>
                    <TableCell>{o.payee}</TableCell>
                    <TableCell>{formatCents(o.amount_cents)}</TableCell>
                  </TableRow>
                ))}
                {forecast.occurrences.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-ink-secondary">
                      Nothing scheduled in this window.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </>
        )}
      </div>
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
  const [category, setCategory] = useState(
    initialValues?.category != null ? String(initialValues.category) : UNCATEGORIZED,
  );
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        payee,
        amount_cents: Math.round(parseFloat(amount || "0") * 100),
        frequency,
        start_date: startDate,
        end_date: endDate || null,
        category: category === UNCATEGORIZED ? null : Number(category),
      });
      if (!initialValues) {
        setPayee("");
        setAmount("");
        setEndDate("");
      }
    } catch (e) {
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-wrap items-end gap-4")}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rt-payee">Payee</Label>
        <Input id="rt-payee" value={payee} onChange={(e) => setPayee(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rt-amount">Amount</Label>
        <Input
          id="rt-amount"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Frequency</Label>
        <Select value={frequency} onValueChange={setFrequency}>
          <SelectTrigger className="w-32" aria-label="Frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rt-start">Start date</Label>
        <Input
          id="rt-start"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rt-end">End date (optional)</Label>
        <Input id="rt-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNCATEGORIZED}>Uncategorized</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

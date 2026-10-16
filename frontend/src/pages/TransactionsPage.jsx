import { useEffect, useRef, useState } from "react";
import { listAccounts } from "../api/accounts";
import { createCategory, listCategories } from "../api/categories";
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from "../api/transactions";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";

const UNCATEGORIZED = "uncategorized";
const ALL_CATEGORIES = "all";

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
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", category: ALL_CATEGORIES, search: "" });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState(new Set());
  const hasLoadedRef = useRef(false);
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
      return undefined;
    }
    setLoading(true);
    return listTransactions({
      account: accountId,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      category: filters.category === ALL_CATEGORIES ? "" : filters.category,
      search: filters.search,
    })
      .then((data) => {
        setTransactions(data);
        hasLoadedRef.current = true;
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, filters]);

  async function handleCreate(values) {
    await createTransaction({ ...values, account: accountId });
    toast.success("Transaction added.");
    await reload();
  }

  async function handleSave(id, values) {
    await updateTransaction(id, values);
    toast.success("Transaction updated.");
    setEditingId(null);
    await reload();
  }

  async function handleDelete(id) {
    setPending(id, true);
    try {
      await deleteTransaction(id);
      toast.success("Transaction deleted.");
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    } finally {
      setPending(id, false);
    }
  }

  async function handleInlineCategorySelect(transactionId, categoryId) {
    try {
      await updateTransaction(transactionId, { category: categoryId });
      toast.success("Category updated.");
      await reload();
    } catch (e) {
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    }
  }

  async function handleInlineCategoryCreate(transactionId, name) {
    try {
      const created = await createCategory(name);
      setCategories((prev) => [...prev, created]);
      await updateTransaction(transactionId, { category: created.id });
      toast.success(`Created "${name}" and assigned it.`);
      await reload();
    } catch (e) {
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    }
  }

  if (accounts.length === 0) {
    return (
      <section>
        <h1 className="text-xl font-semibold text-ink-primary">Transactions</h1>
        <p className="mt-2 text-sm text-ink-secondary">Add an account first.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink-primary">Transactions</h1>

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
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date-from">From</Label>
            <Input
              id="date-from"
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date-to">To</Label>
            <Input
              id="date-to"
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Select value={filters.category} onValueChange={(v) => setFilters({ ...filters, category: v })}>
              <SelectTrigger className="w-40" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>All</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="search">Search</Label>
            <Input
              id="search"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add transaction</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionForm categories={categories} onSubmit={handleCreate} submitLabel="Add transaction" />
        </CardContent>
      </Card>

      {!hasLoadedRef.current && loading ? (
        <p className="text-sm text-ink-secondary">Loading...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) =>
              editingId === t.id ? (
                <TableRow key={t.id}>
                  <TableCell colSpan={5}>
                    <TransactionForm
                      initialValues={t}
                      categories={categories}
                      submitLabel="Save"
                      onSubmit={(values) => handleSave(t.id, values)}
                      onCancel={() => setEditingId(null)}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={t.id}>
                  <TableCell>{t.date}</TableCell>
                  <TableCell>{t.payee}</TableCell>
                  <TableCell>
                    <CategoryCombobox
                      categories={categories}
                      value={t.category}
                      onSelect={(categoryId) => handleInlineCategorySelect(t.id, categoryId)}
                      allowCreate
                      onCreate={(name) => handleInlineCategoryCreate(t.id, name)}
                    />
                  </TableCell>
                  <TableCell>{formatCents(t.amount_cents)}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pendingIds.has(t.id)}
                      onClick={() => setEditingId(t.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pendingIds.has(t.id)}
                      onClick={() => handleDelete(t.id)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ),
            )}
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-ink-secondary">
                  No transactions yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
  const [category, setCategory] = useState(
    initialValues?.category != null ? String(initialValues.category) : UNCATEGORIZED,
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        date,
        amount_cents: Math.round(parseFloat(amount || "0") * 100),
        payee,
        category: category === UNCATEGORIZED ? null : Number(category),
        notes,
      });
      if (!initialValues) {
        setAmount("");
        setPayee("");
        setCategory(UNCATEGORIZED);
        setNotes("");
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
        <Label htmlFor="txn-date">Date</Label>
        <Input id="txn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="txn-amount">Amount</Label>
        <Input
          id="txn-amount"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-28"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="txn-payee">Payee</Label>
        <Input id="txn-payee" value={payee} onChange={(e) => setPayee(e.target.value)} required />
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="txn-notes">Notes</Label>
        <Input id="txn-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
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

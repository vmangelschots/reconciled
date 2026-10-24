import { ChevronDown, Split, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, useNavigate, useParams } from "react-router-dom";
import { useAccounts } from "../accounts/AccountsContext";
import { getAccount } from "../api/accounts";
import { createCategory, listCategories } from "../api/categories";
import {
  createTransaction,
  deleteTransaction,
  linkTransfer,
  listTransactions,
  saveSplit,
  unsplit,
  updateTransaction,
} from "../api/transactions";
import { CategoryCombobox } from "../components/CategoryCombobox";
import { SplitEditor } from "../components/SplitEditor";
import { Button, buttonVariants } from "../components/ui/Button";
import { Amount } from "../components/ui/Amount";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { categoryDisplayLabel } from "../lib/categoryTree";
import { cn } from "../lib/cn";
import { formatShortDate } from "../lib/dates";
import { formatMoney, formatMoneyWhole } from "../lib/money";
import { useReviewCount } from "../review/ReviewCountContext";

// The plain Transactions address opens the account last opened here, or
// the first active one. See the transactions spec.
export function TransactionsIndex() {
  const { loaded, defaultAccount } = useAccounts();
  if (!loaded) return null;
  if (!defaultAccount) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader title="Transactions" />
        <Panel>
          <EmptyState>Add an account first.</EmptyState>
        </Panel>
      </section>
    );
  }
  return <Navigate replace to={`/transactions/${defaultAccount.id}`} />;
}

// Below 1024px there is no sidebar, so the accounts are pills under the
// title, with the open account's balance at the end of the row.
function AccountPills({ accounts, current }) {
  const activeRef = useRef(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [current?.id]);
  return (
    <div className="flex items-center gap-3 lg:hidden">
      {/* Bleeds to the left screen edge only, so the balance stays clear;
          no visible scrollbar - the row is swiped. */}
      <nav
        aria-label="Accounts"
        className="-ml-4 flex min-w-0 flex-1 gap-2 overflow-x-auto pl-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {accounts.map((a) => (
          <NavLink
            key={a.id}
            to={`/transactions/${a.id}`}
            ref={a.id === current?.id ? activeRef : undefined}
            className={({ isActive }) =>
              cn(
                "flex h-8 shrink-0 items-center rounded-full px-3 text-sm whitespace-nowrap",
                isActive ? "bg-accent text-on-accent" : "bg-surface-2 text-ink-secondary hover:text-ink-primary",
              )
            }
          >
            {a.name}
          </NavLink>
        ))}
      </nav>
      {current && (
        <span className="num shrink-0 text-sm font-medium text-ink-primary">
          {formatMoneyWhole(current.current_balance_cents)}
        </span>
      )}
    </div>
  );
}

export function TransactionsPage() {
  const { accountId: accountParam } = useParams();
  const accountId = Number(accountParam);
  const { accounts, loaded: accountsLoaded, setLastOpened } = useAccounts();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  // An archived account isn't in the active list; it is fetched by id.
  const [archivedAccount, setArchivedAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", category: null, search: "" });
  // At most one row is being edited: in the form or in the split editor.
  const [editing, setEditing] = useState(null); // { id, kind: "form" | "split" }
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState(new Set());
  const hasLoadedRef = useRef(false);
  const nextTempIdRef = useRef(-1);
  const toast = useToast();
  // Confirming, changing or deleting a guessed category changes the nav's
  // Review count, so every save here refreshes it.
  const { refresh: refreshReviewCount } = useReviewCount();

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
    listCategories().then(setCategories);
  }, []);

  const activeAccount = accounts.find((a) => a.id === accountId) ?? null;
  const account = activeAccount ?? (archivedAccount?.id === accountId ? archivedAccount : null);
  const isArchived = Boolean(account?.archived);

  useEffect(() => {
    if (!accountsLoaded) return;
    if (activeAccount) {
      setLastOpened(activeAccount.id);
      return;
    }
    let current = true;
    getAccount(accountId)
      .then((a) => current && setArchivedAccount(a))
      .catch(() => {
        if (!current) return;
        toast.error("That account wasn't found.");
        navigate("/transactions", { replace: true });
      });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, accountsLoaded, activeAccount?.id]);

  function reload() {
    if (!account) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return listTransactions({
      account: accountId,
      date_from: filters.dateFrom,
      date_to: filters.dateTo,
      category: filters.category ?? "",
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
  }, [account?.id, filters]);

  // The form reports a transfer target separately from the category: a
  // new transaction is created first, then linked (matching or creating
  // its other side).
  async function handleCreate(values, transferAccountId) {
    const created = await createTransaction({ ...values, account: accountId });
    if (transferAccountId != null) await linkTransfer(created.id, transferAccountId);
    toast.success("Transaction added.");
    await reload();
  }

  // Sending `category` on a transfer would unlink it (that's how picking a
  // category ends a transfer), so it is left out while the row stays one;
  // a changed target re-links.
  // A split transaction has no category of its own, so the form leaves it
  // out for one too.
  async function handleSave(transaction, values, transferAccountId) {
    const { category: _category, ...rest } = values;
    const stayingTransfer = transferAccountId != null;
    const isSplit = transaction.parts?.length > 0;
    await updateTransaction(transaction.id, stayingTransfer || isSplit ? rest : values);
    if (stayingTransfer && transferAccountId !== transaction.transfer?.account_id) {
      await linkTransfer(transaction.id, transferAccountId);
    }
    toast.success("Transaction updated.");
    refreshReviewCount();
    setEditing(null);
    await reload();
  }

  async function handleDelete(id) {
    setPending(id, true);
    try {
      await deleteTransaction(id);
      toast.success("Transaction deleted.");
      refreshReviewCount();
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    } finally {
      setPending(id, false);
    }
  }

  // A row is a transaction or one of its parts: these find and change
  // either, so the inline category handlers work on parts unchanged.
  function mapRows(prev, fn) {
    return prev.map((t) => {
      const mapped = fn(t);
      return mapped.parts?.length ? { ...mapped, parts: mapped.parts.map(fn) } : mapped;
    });
  }

  function updateRow(id, fn) {
    setTransactions((prev) => mapRows(prev, (t) => (t.id === id ? fn(t) : t)));
  }

  function findRow(id) {
    for (const t of transactions) {
      if (t.id === id) return t;
      const part = t.parts?.find((p) => p.id === id);
      if (part) return part;
    }
    return null;
  }

  function replaceTransaction(updated) {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function focusCategoryCell(id) {
    requestAnimationFrame(() => document.querySelector(`[data-category-cell="${id}"] button`)?.focus());
  }

  function closeSplit(id) {
    setEditing(null);
    focusCategoryCell(id);
  }

  async function handleSaveSplit(transaction, parts) {
    setPending(transaction.id, true);
    try {
      replaceTransaction(await saveSplit(transaction.id, parts));
      toast.success(transaction.parts?.length ? "Split updated." : "Transaction split.");
      refreshReviewCount();
      closeSplit(transaction.id);
    } catch (e) {
      toast.error(e.data?.detail || e.message);
      throw e;
    } finally {
      setPending(transaction.id, false);
    }
  }

  async function handleUnsplit(transaction, keep) {
    setPending(transaction.id, true);
    try {
      replaceTransaction(await unsplit(transaction.id, keep));
      toast.success("Transaction unsplit.");
      refreshReviewCount();
      closeSplit(transaction.id);
    } catch (e) {
      toast.error(e.data?.detail || e.message);
      throw e;
    } finally {
      setPending(transaction.id, false);
    }
  }

  // Inline category changes are optimistic: the row shows the new
  // category straight away and the save runs in the background, with no
  // list reload. A failed save puts the old category back - but only if
  // the row still shows the value we set, so a later pick isn't undone.
  // Picking a category also ends a transfer (the backend unlinks it), so
  // the row's transfer is cleared alongside, and restored on revert.
  // Any pick confirms the category - re-picking a guess is how the ledger
  // accepts it - so a revert also restores whether it was still a guess.
  function setRowCategory(transactionId, category, onlyIf, transfer = null, confirmed = true) {
    updateRow(transactionId, (t) =>
      onlyIf === undefined || t.category === onlyIf ? { ...t, category, transfer, category_confirmed: confirmed } : t,
    );
  }

  function rowSnapshot(transactionId) {
    const row = findRow(transactionId);
    return {
      category: row?.category ?? null,
      transfer: row?.transfer ?? null,
      category_confirmed: row?.category_confirmed ?? true,
    };
  }

  async function handleInlineCategorySelect(transactionId, categoryId) {
    const previous = rowSnapshot(transactionId);
    setRowCategory(transactionId, categoryId);
    try {
      await updateTransaction(transactionId, { category: categoryId });
      toast.success("Category updated.");
      refreshReviewCount();
    } catch (e) {
      setRowCategory(transactionId, previous.category, categoryId, previous.transfer, previous.category_confirmed);
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    }
  }

  // Marking a row as a transfer is optimistic too: it shows "→ Savings"
  // at once; the server's answer (the linked or created counterpart)
  // replaces the placeholder, or the row is put back on failure.
  async function handleInlineTransferSelect(transactionId, targetAccountId) {
    const previous = rowSnapshot(transactionId);
    const target = accounts.find((a) => a.id === targetAccountId);
    const placeholder = { account_id: targetAccountId, account_name: target?.name, counterpart_id: null };
    const stillPlaceholder = (t) => t.transfer === placeholder;
    updateRow(transactionId, (t) => ({ ...t, category: null, transfer: placeholder }));
    try {
      const { transaction } = await linkTransfer(transactionId, targetAccountId);
      updateRow(transactionId, (t) => (stillPlaceholder(t) ? transaction : t));
      toast.success(`Marked as a transfer with ${target?.name}.`);
      refreshReviewCount();
    } catch (e) {
      updateRow(transactionId, (t) => (stillPlaceholder(t) ? { ...t, ...previous } : t));
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    }
  }

  async function handleInlineCategoryCreate(transactionId, name) {
    const previous = rowSnapshot(transactionId);
    // Negative ids never collide with server ids; the placeholder lets
    // the row show the new name before the category exists.
    const tempId = nextTempIdRef.current--;
    setCategories((prev) => [...prev, { id: tempId, name, parent: null }]);
    setRowCategory(transactionId, tempId);
    let created = null;
    try {
      created = await createCategory(name);
      setCategories((prev) => prev.map((c) => (c.id === tempId ? created : c)));
      setTransactions((prev) => mapRows(prev, (t) => (t.category === tempId ? { ...t, category: created.id } : t)));
      await updateTransaction(transactionId, { category: created.id });
      toast.success(`Created "${name}" and assigned it.`);
      refreshReviewCount();
    } catch (e) {
      if (!created) setCategories((prev) => prev.filter((c) => c.id !== tempId));
      setRowCategory(
        transactionId,
        previous.category,
        created ? created.id : tempId,
        previous.transfer,
        previous.category_confirmed,
      );
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    }
  }

  // The account list only holds active accounts; a row can't transfer to
  // its own account.
  const transferTargets = accounts.filter((a) => a.id !== accountId);
  const filtering = Boolean(filters.dateFrom || filters.dateTo || filters.category != null || filters.search);

  if (!account) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader title="Transactions" />
        <Panel loading />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader title="Transactions">
        <span className="flex items-center gap-2 text-sm text-ink-secondary">
          <span className={cn(accounts.length > 1 && !isArchived && "hidden lg:inline")}>{account.name}</span>
          {isArchived && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-muted ring-1 ring-border">
              Archived
            </span>
          )}
        </span>
      </PageHeader>

      {accounts.length > 1 && !isArchived && <AccountPills accounts={accounts} current={activeAccount} />}

      <Panel title="Filters">
        <div className="flex flex-wrap items-end gap-4">
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
            <CategoryCombobox
              categories={categories}
              value={filters.category}
              onSelect={(categoryId) => setFilters({ ...filters, category: categoryId })}
              clearLabel="All"
              placeholder="All"
              aria-label="Filter by category"
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="search">Search</Label>
            <Input
              id="search"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
        </div>
      </Panel>

      {!isArchived && (
        <Panel title="Add transaction">
          <TransactionForm
            categories={categories}
            transferAccounts={transferTargets}
            onSubmit={handleCreate}
            submitLabel="Add transaction"
          />
        </Panel>
      )}

      {!hasLoadedRef.current && loading ? (
        <Panel loading />
      ) : (
        <Panel flush className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          {/* One row group per transaction, so a split and its parts share
              a hover and have no dividers between them. */}
          {transactions.map((t) => {
            const isSplit = t.parts?.length > 0;
            const splitOpen = editing?.kind === "split" && editing.id === t.id;
            const grouped = isSplit || splitOpen;
            const pending = pendingIds.has(t.id);
            const openSplit = () => setEditing({ id: t.id, kind: "split" });
            // The left bar ties a split's rows together.
            const barCell = grouped ? "shadow-[inset_2px_0_0_var(--ink-muted)]" : undefined;
            if (editing?.kind === "form" && editing.id === t.id) {
              return (
                <tbody key={t.id} className="border-b border-border last:border-b-0">
                  <TableRow>
                    <TableCell colSpan={6}>
                      <TransactionForm
                        initialValues={t}
                        categories={categories}
                        transferAccounts={transferTargets}
                        submitLabel="Save"
                        onSubmit={(values, transferAccountId) => handleSave(t, values, transferAccountId)}
                        onCancel={() => setEditing(null)}
                        onEditSplit={openSplit}
                      />
                    </TableCell>
                  </TableRow>
                </tbody>
              );
            }
            return (
              <tbody key={t.id} className="group border-b border-border last:border-b-0">
                <TableRow className={cn("hover:bg-transparent group-hover:bg-surface-2", splitOpen && "bg-surface-2")}>
                  <TableCell className={cn(barCell, "whitespace-nowrap text-ink-secondary")}>{formatShortDate(t.date)}</TableCell>
                  <TableCell>{t.payee}</TableCell>
                  {/* Long notes stay on one line; the full text is in the tooltip. */}
                  <TableCell className="max-w-xs truncate text-ink-secondary" title={t.notes || undefined}>
                    {t.notes}
                  </TableCell>
                  <TableCell data-category-cell={t.id}>
                    {isSplit ? (
                      <SplitCellButton
                        count={t.parts.length}
                        open={splitOpen}
                        onClick={() => (splitOpen ? closeSplit(t.id) : openSplit())}
                      />
                    ) : (
                      <CategoryCombobox
                        categories={categories}
                        value={t.category}
                        onSelect={(categoryId) => handleInlineCategorySelect(t.id, categoryId)}
                        allowCreate
                        onCreate={(name) => handleInlineCategoryCreate(t.id, name)}
                        transferAccounts={transferTargets}
                        transferAccountId={t.transfer?.account_id ?? null}
                        transferAccountName={t.transfer?.account_name}
                        direction={t.amount_cents < 0 ? "out" : "in"}
                        onSelectTransfer={(targetId) => handleInlineTransferSelect(t.id, targetId)}
                        suggestion={t.category_confirmed === false ? t.category_source : null}
                        suggestionReason={t.category_reason}
                        onSplit={t.transfer ? undefined : openSplit}
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Amount cents={t.amount_cents} signed />
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => setEditing({ id: t.id, kind: "form" })}
                    >
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => handleDelete(t.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
                {splitOpen ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className={cn("pt-0", barCell)}>
                      <SplitEditor
                        transaction={t}
                        categories={categories}
                        transferAccounts={transferTargets}
                        onSave={(parts) => handleSaveSplit(t, parts)}
                        onUnsplit={(keep) => handleUnsplit(t, keep)}
                        onCancel={() => closeSplit(t.id)}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  t.parts?.map((part) => (
                    <TableRow
                      key={part.id}
                      className={cn(
                        "hover:bg-transparent group-hover:bg-surface-2",
                        // While filtering by a category, the parts that
                        // didn't match step back.
                        filters.category != null && part.category !== filters.category && "opacity-60",
                      )}
                    >
                      <TableCell className={cn("py-1.5", barCell)} />
                      <TableCell className="py-1.5" />
                      <TableCell className="max-w-xs truncate py-1.5 text-ink-secondary" title={part.notes || undefined}>
                        <span className="text-ink-muted">↳</span> {part.notes}
                      </TableCell>
                      <TableCell className="py-1.5" data-category-cell={part.id}>
                        <CategoryCombobox
                          categories={categories}
                          value={part.category}
                          onSelect={(categoryId) => handleInlineCategorySelect(part.id, categoryId)}
                          allowCreate
                          onCreate={(name) => handleInlineCategoryCreate(part.id, name)}
                          transferAccounts={transferTargets}
                          transferAccountId={part.transfer?.account_id ?? null}
                          transferAccountName={part.transfer?.account_name}
                          direction={part.amount_cents < 0 ? "out" : "in"}
                          onSelectTransfer={(targetId) => handleInlineTransferSelect(part.id, targetId)}
                          aria-label={`Category of part ${part.notes || formatMoney(part.amount_cents)}`}
                        />
                      </TableCell>
                      <TableCell className="py-1.5 text-right text-ink-secondary">
                        <Amount cents={part.amount_cents} signed className="text-ink-secondary" />
                      </TableCell>
                      <TableCell className="py-1.5">
                        {/* A part is changed (or removed) through its split. */}
                        <Button variant="outline" size="sm" disabled={pending} onClick={openSplit}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </tbody>
            );
          })}
          {transactions.length === 0 && (
            <tbody>
              <TableRow>
                <TableCell colSpan={6}>
                  {filtering ? (
                    <EmptyState>No transactions match these filters.</EmptyState>
                  ) : (
                    <EmptyState
                      action={
                        !isArchived && (
                          <Link to={`/import?account=${account.id}`} className={buttonVariants({ variant: "outline" })}>
                            <Upload className="h-4 w-4" aria-hidden="true" />
                            Import
                          </Link>
                        )
                      }
                    >
                      No transactions yet.
                    </EmptyState>
                  )}
                </TableCell>
              </TableRow>
            </tbody>
          )}
        </Table>
        </Panel>
      )}
    </section>
  );
}

// The category cell of a split transaction: opens (or closes) its editor.
function SplitCellButton({ count, open, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="flex h-8 min-w-32 items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 text-left text-sm text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="flex items-center gap-1.5">
        <Split className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        Split · {count}
      </span>
      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 opacity-50 transition-transform", open && "rotate-180")} />
    </button>
  );
}

function TransactionForm({
  initialValues,
  categories,
  transferAccounts = [],
  onSubmit,
  onCancel,
  onEditSplit,
  submitLabel,
}) {
  const parts = initialValues?.parts ?? [];
  const isSplit = parts.length > 0;
  const categoriesById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const [date, setDate] = useState(initialValues?.date ?? new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(
    initialValues ? (initialValues.amount_cents / 100).toString() : "",
  );
  const [payee, setPayee] = useState(initialValues?.payee ?? "");
  const [category, setCategory] = useState(initialValues?.category ?? null);
  // A transfer and a category are mutually exclusive: picking one clears
  // the other.
  const [transferAccountId, setTransferAccountId] = useState(initialValues?.transfer?.account_id ?? null);
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
        category,
        notes,
      }, transferAccountId);
      if (!initialValues) {
        setAmount("");
        setPayee("");
        setCategory(null);
        setTransferAccountId(null);
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
          disabled={isSplit}
          title={isSplit ? "Unsplit to change the amount" : undefined}
        />
        {isSplit && <p className="text-xs text-ink-muted">Unsplit to change the amount</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="txn-payee">Payee</Label>
        <Input id="txn-payee" value={payee} onChange={(e) => setPayee(e.target.value)} required />
      </div>
      {isSplit ? (
        <div className="flex flex-col gap-1.5">
          <Label>Split</Label>
          <ul className="flex flex-col text-sm text-ink-secondary">
            {parts.map((p) => (
              <li key={p.id} className="flex gap-3">
                <span>
                  {p.transfer
                    ? `${p.amount_cents < 0 ? "→" : "←"} ${p.transfer.account_name}`
                    : p.category != null && categoriesById[p.category]
                      ? categoryDisplayLabel(categoriesById[p.category], categoriesById)
                      : "Uncategorized"}
                </span>
                <span className="tabular-nums">{formatMoney(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" onClick={onEditSplit}>
            <Split className="h-3.5 w-3.5" />
            Edit split
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label>Category</Label>
          <CategoryCombobox
            categories={categories}
            value={category}
            onSelect={(id) => {
              setCategory(id);
              setTransferAccountId(null);
            }}
            placeholder="Uncategorized"
            aria-label="Category"
            className="w-40"
            transferAccounts={transferAccounts}
            transferAccountId={transferAccountId}
            transferAccountName={initialValues?.transfer?.account_name}
            direction={parseFloat(amount || "0") > 0 ? "in" : "out"}
            onSelectTransfer={(id) => {
              setTransferAccountId(id);
              setCategory(null);
            }}
          />
        </div>
      )}
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

import { useEffect, useRef, useState } from "react";
import {
  ACCOUNT_TYPES,
  archiveAccount,
  createAccount,
  listAccounts,
  updateAccount,
} from "../api/accounts";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { formatMoney } from "../lib/money";

function typeLabel(value) {
  return ACCOUNT_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
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

  function reload() {
    setLoading(true);
    return listAccounts()
      .then((data) => {
        setAccounts(data);
        hasLoadedRef.current = true;
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(values) {
    await createAccount(values);
    toast.success("Account created.");
    await reload();
  }

  async function handleSave(id, values) {
    await updateAccount(id, values);
    toast.success("Account updated.");
    setEditingId(null);
    await reload();
  }

  async function handleArchive(id) {
    setPending(id, true);
    try {
      await archiveAccount(id);
      toast.success("Account archived.");
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    } finally {
      setPending(id, false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-ink-primary">Accounts</h1>

      <Card>
        <CardHeader>
          <CardTitle>Add account</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm onSubmit={handleCreate} submitLabel="Add account" />
        </CardContent>
      </Card>

      {!hasLoadedRef.current && loading ? (
        <p className="text-sm text-ink-secondary">Loading...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) =>
              editingId === account.id ? (
                <TableRow key={account.id}>
                  <TableCell colSpan={4}>
                    <AccountForm
                      initialValues={account}
                      submitLabel="Save"
                      onSubmit={(values) => handleSave(account.id, values)}
                      onCancel={() => setEditingId(null)}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={account.id}>
                  <TableCell>{account.name}</TableCell>
                  <TableCell>{typeLabel(account.account_type)}</TableCell>
                  <TableCell>{formatMoney(account.current_balance_cents)}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pendingIds.has(account.id)}
                      onClick={() => setEditingId(account.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pendingIds.has(account.id)}
                      onClick={() => handleArchive(account.id)}
                    >
                      Archive
                    </Button>
                  </TableCell>
                </TableRow>
              ),
            )}
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-ink-secondary">
                  No accounts yet - add one above.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
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
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  async function handleSubmit(event) {
    event.preventDefault();
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
      toast.error(e.data ? Object.values(e.data).flat().join(" ") : e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-name">Name</Label>
        <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Type</Label>
        <Select value={accountType} onValueChange={setAccountType}>
          <SelectTrigger className="w-40" aria-label="Account type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="starting-balance">Starting balance</Label>
        <Input
          id="starting-balance"
          type="number"
          step="0.01"
          value={startingBalance}
          onChange={(e) => setStartingBalance(e.target.value)}
          className="w-32"
        />
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

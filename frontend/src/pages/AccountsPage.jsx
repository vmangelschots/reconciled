import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ACCOUNT_TYPES, archiveAccount, createAccount, listAccounts, updateAccount } from "../api/accounts";
import { TIERS, tierLabel } from "../lib/tiers";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../components/ui/Select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { Amount } from "../components/ui/Amount";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";

function typeLabel(value) {
  return ACCOUNT_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function AccountsPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [pendingIds, setPendingIds] = useState(new Set());
  const [adding, setAdding] = useState(false);
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
    setAdding(false);
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

  // The add form opens from the header, and stays open while there is
  // nothing else to show.
  const showAddForm = adding || (hasLoadedRef.current && accounts.length === 0);

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        actions={!showAddForm && <Button onClick={() => setAdding(true)}>Add account</Button>}
      />

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add account</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountForm
              onSubmit={handleCreate}
              submitLabel="Add account"
              onCancel={accounts.length > 0 ? () => setAdding(false) : undefined}
            />
          </CardContent>
        </Card>
      )}

      {!hasLoadedRef.current && loading ? (
        <Panel loading />
      ) : (
        <Panel flush className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) =>
              editingId === account.id ? (
                <TableRow key={account.id}>
                  <TableCell colSpan={5}>
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
                  <TableCell>
                    {/* The way to an account's transactions on a wide screen, where
                        the sidebar lists only five - see the accounts spec. */}
                    <Link
                      to={`/transactions/${account.id}`}
                      className="font-medium text-ink-primary underline-offset-2 hover:text-accent hover:underline"
                    >
                      {account.name}
                    </Link>
                  </TableCell>
                  <TableCell>{typeLabel(account.account_type)}</TableCell>
                  <TableCell className="text-ink-secondary">{tierLabel(account.tier)}</TableCell>
                  <TableCell className="text-right">
                    <Amount cents={account.current_balance_cents} />
                  </TableCell>
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
                <TableCell colSpan={5}>
                  <EmptyState>No accounts yet - add one above.</EmptyState>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </Panel>
      )}
    </section>
  );
}

function AccountForm({ initialValues, onSubmit, onCancel, submitLabel }) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [accountType, setAccountType] = useState(initialValues?.account_type ?? "checking");
  // A loan's starting balance is entered as what is still owed, a
  // positive amount stored as negative - see the accounts spec.
  const [startingBalance, setStartingBalance] = useState(
    initialValues
      ? ((initialValues.account_type === "loan" ? -1 : 1) * initialValues.starting_balance_cents / 100).toString()
      : "0",
  );
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  // Switching to or from a loan flips the field between a balance and
  // what is owed, so the same amount keeps its meaning.
  function changeType(next) {
    if ((next === "loan") !== (accountType === "loan") && startingBalance && parseFloat(startingBalance) !== 0) {
      setStartingBalance((-parseFloat(startingBalance)).toString());
    }
    setAccountType(next);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const isLoan = accountType === "loan";
    const cents = Math.round(parseFloat(startingBalance || "0") * 100);
    if (isLoan && cents < 0) {
      toast.error("Enter what you still owe as a positive amount.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name,
        account_type: accountType,
        starting_balance_cents: isLoan ? -cents : cents,
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
        <Select value={accountType} onValueChange={changeType}>
          <SelectTrigger className="w-40" aria-label="Account type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIERS.map((tier) => (
              <SelectGroup key={tier.value}>
                <SelectLabel>{tier.label}</SelectLabel>
                {ACCOUNT_TYPES.filter((t) => t.tier === tier.value).map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="starting-balance">{accountType === "loan" ? "Still owed" : "Starting balance"}</Label>
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

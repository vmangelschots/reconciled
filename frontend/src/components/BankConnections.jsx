import { Landmark, TriangleAlert, Unlink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  authorizeBank,
  disconnectBank,
  getBanks,
  linkBankAccount,
  unlinkBankAccount,
} from "../api/bankSync";
import { useBankSync } from "../bankSync/BankSyncContext";
import { formatSyncTime } from "../lib/bankSync";
import { BankSyncStatus } from "./BankSyncStatus";
import { plural } from "../lib/importFreshness";
import { BankCredentials, credentialsBadge } from "./BankCredentials";
import { formatDayMonth } from "../lib/yearlyBudgets";
import { Button } from "./ui/Button";
import { Panel } from "./ui/Panel";
import { Input } from "./ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/Select";
import { useToast } from "./ui/Toast";
import { cn } from "../lib/cn";

function maskedIban(iban) {
  return iban ? `•••• ${iban.slice(-4)}` : "";
}

function LinkStatus({ link, onUnlink }) {
  const synced = link.last_synced_at
    ? `Last sync ${formatSyncTime(link.last_synced_at)}, ${plural(link.last_added_count, "line", "lines")} added`
    : "Not synced yet";
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5 text-sm text-ink-secondary">
        <span>
          → {link.account_name}, from {formatDayMonth(link.start_date)}
        </span>
        <span>{synced}</span>
        {link.last_error && <span className="text-warning">{link.last_error}</span>}
      </div>
      <Button variant="outline" size="sm" onClick={onUnlink}>
        <Unlink className="h-4 w-4" />
        Unlink
      </Button>
    </div>
  );
}

function LinkForm({ account, connectionId, ledgerAccounts, onLinked }) {
  const toast = useToast();
  const [accountId, setAccountId] = useState("");
  const [startDate, setStartDate] = useState("");

  function choose(id) {
    setAccountId(id);
    setStartDate(ledgerAccounts.find((a) => String(a.id) === id)?.default_start_date ?? "");
  }

  async function submit() {
    try {
      await linkBankAccount({
        connection_id: connectionId,
        uid: account.uid,
        account_id: Number(accountId),
        start_date: startDate,
      });
      onLinked();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select value={accountId} onValueChange={choose}>
        <SelectTrigger className="w-56" aria-label={`Ledger account for ${account.name}`}>
          <SelectValue placeholder="Link to an account" />
        </SelectTrigger>
        <SelectContent>
          {ledgerAccounts.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {accountId && (
        <>
          <Input
            type="date"
            className="w-40"
            aria-label="Start date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Button size="sm" onClick={submit} disabled={!startDate}>
            Link
          </Button>
        </>
      )}
    </div>
  );
}

function Connection({ connection, ledgerAccounts, onChange, onReconnect }) {
  const toast = useToast();

  async function run(action) {
    try {
      await action();
      onChange();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-ink-primary">{connection.bank_name}</span>
          <span className={connection.ended ? "text-sm text-warning" : "text-sm text-ink-secondary"}>
            {connection.ended
              ? "Consent ended, so this bank doesn't sync"
              : `Consent until ${formatDayMonth(connection.valid_until.slice(0, 10))}`}
          </span>
        </div>
        <div className="flex gap-2">
          {connection.ended && (
            <Button size="sm" onClick={() => onReconnect(connection.bank_name)}>
              Reconnect
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => run(() => disconnectBank(connection.id))}>
            Disconnect
          </Button>
        </div>
      </div>
      {connection.accounts.map((account) => (
        <div key={account.uid} className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
          <span className="text-sm text-ink-primary">
            {account.name} {maskedIban(account.iban)} {account.currency}
          </span>
          {account.link ? (
            <LinkStatus link={account.link} onUnlink={() => run(() => unlinkBankAccount(account.link.id))} />
          ) : (
            <LinkForm
              account={account}
              connectionId={connection.id}
              ledgerAccounts={ledgerAccounts}
              onLinked={onChange}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Settings' bank connections - see specs/bank-sync.
export function BankConnections() {
  const toast = useToast();
  // A new object on every toast; loading must not depend on it.
  const toastRef = useRef(toast);
  // Shared with the page headers' sync status - see bankSync/BankSyncContext.
  const { status, reload } = useBankSync();
  const [banks, setBanks] = useState([]);
  const [bank, setBank] = useState("");

  const load = useCallback(async () => {
    try {
      await reload();
    } catch (e) {
      toastRef.current.error(e.message);
    }
  }, [reload]);

  useEffect(() => {
    load();
  }, [load]);

  const credentials = status?.credentials;
  const enabled = status?.enabled && credentials?.state === "ready";
  // Connections stay in view while a key is being fixed.
  const showBanks = status?.enabled && (enabled || status.connections.length > 0 || status.waiting_links.length > 0);
  useEffect(() => {
    if (enabled) {
      getBanks()
        .then((result) => setBanks(result.banks))
        .catch((e) => toastRef.current.error(e.data?.detail ?? e.message));
    }
  }, [enabled]);

  async function connect(bankName) {
    try {
      const { url } = await authorizeBank(bankName);
      window.location.assign(url);
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  return (
    <Panel id="bank-connections" title="Bank connections" loading={status === null} actions={
        <>
          <BankSyncStatus />
          {credentialsBadge(credentials)}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {credentials && <BankCredentials credentials={credentials} onChange={load} />}
        {showBanks && (
          <>
            {status.waiting_links.map((link) => (
              <div key={link.id} className="flex items-center justify-between gap-3 rounded-lg bg-warning/10 p-3">
                <span className="flex gap-2 text-sm text-ink-primary">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  {link.account_name} needs {link.bank_name} reconnected.
                </span>
                <Button size="sm" onClick={() => connect(link.bank_name)}>
                  Reconnect
                </Button>
              </div>
            ))}
            {status.connections.length > 0 && (
              <div className="divide-y divide-border">
                {status.connections.map((connection) => (
                  <Connection
                    key={connection.id}
                    connection={connection}
                    ledgerAccounts={status.accounts}
                    onChange={load}
                    onReconnect={connect}
                  />
                ))}
              </div>
            )}
            <div
              className={cn(
                "flex flex-col gap-2 sm:flex-row sm:items-center",
                status.connections.length > 0 && "border-t border-border pt-4",
              )}
            >
              <span className="text-sm text-ink-secondary">Add a bank</span>
              <div className="flex gap-2">
                <Select value={bank} onValueChange={setBank}>
                  <SelectTrigger className="w-56" aria-label="Bank">
                    <SelectValue placeholder="Choose a bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => connect(bank)} disabled={!bank}>
                  <Landmark className="h-4 w-4" />
                  Connect
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

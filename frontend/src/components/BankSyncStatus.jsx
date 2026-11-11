import * as PopoverPrimitive from "@radix-ui/react-popover";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { authorizeBank } from "../api/bankSync";
import { useBankSync } from "../bankSync/BankSyncContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { formatSyncClock, formatSyncedAt, syncLabel } from "../lib/bankSync";
import { cn } from "../lib/cn";
import { plural } from "../lib/importFreshness";
import { Button } from "./ui/Button";
import { useToast } from "./ui/Toast";

function LinkRow({ link, onReconnect }) {
  const name = `${link.bank_name} → ${link.account_name}`;
  let detail;
  if (link.problem === "reconnect") {
    detail = (
      <div className="flex items-center justify-between gap-2">
        <span className="text-warning">{link.bank_name} needs reconnecting</span>
        <Button size="sm" variant="outline" onClick={() => onReconnect(link.bank_name)}>
          Reconnect
        </Button>
      </div>
    );
  } else if (link.problem === "error") {
    detail = (
      <span className="text-warning">
        {link.last_error} The next sync tries again.
      </span>
    );
  } else if (link.last_synced_at) {
    detail = (
      <span>
        {formatSyncedAt(link.last_synced_at)} · {plural(link.last_added_count, "line", "lines")}
      </span>
    );
  } else {
    detail = <span>Not synced yet</span>;
  }
  return (
    <li className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
      <span className="text-sm font-medium text-ink-primary">{name}</span>
      <div className="text-xs text-ink-secondary">{detail}</div>
    </li>
  );
}

// The household's bank sync in a page header - see specs/bank-sync, "Sync
// status". Hidden while bank sync isn't set up or nothing is linked.
export function BankSyncStatus({ className }) {
  const { status, summary, result, syncNow } = useBankSync();
  const toast = useToast();
  const toastRef = useRef(toast);
  // Assume a wide screen where it can't be measured.
  const narrow = useMediaQuery("(max-width: 639px)");
  if (!summary) return null;

  const running = summary.state === "running";
  const warning = summary.state === "stopped" || (summary.issues > 0 && !running);
  const label = syncLabel(summary, running ? null : result, undefined, narrow);

  async function reconnect(bankName) {
    try {
      const { url } = await authorizeBank(bankName);
      window.location.assign(url);
    } catch (e) {
      toastRef.current.error(e.data?.detail ?? e.message);
    }
  }

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("text-ink-secondary", warning && "text-warning", className)}
          aria-label={`Bank sync: ${syncLabel(summary, running ? null : result)}`}
        >
          {warning ? (
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          ) : (
            <RefreshCw className={cn("h-4 w-4", running && "animate-spin")} aria-hidden="true" />
          )}
          {label}
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          className="z-50 flex w-72 flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-md"
        >
          {summary.state === "stopped" && (
            <p className="text-sm text-warning">
              Enable Banking no longer accepts your key.{" "}
              <PopoverPrimitive.Close asChild>
                <Link to="/settings#bank-connections" className="font-medium underline">
                  Open Bank connections
                </Link>
              </PopoverPrimitive.Close>
            </p>
          )}
          <ul className="flex flex-col divide-y divide-border">
            {summary.links.map((link) => (
              <LinkRow key={link.id} link={link} onReconnect={reconnect} />
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <span className="text-xs text-ink-secondary">
              {status?.next_sync_at ? `Next sync ${formatSyncClock(status.next_sync_at)}` : ""}
            </span>
            <Button size="sm" onClick={syncNow} disabled={running || summary.state === "stopped"}>
              <RefreshCw className={cn("h-4 w-4", running && "animate-spin")} aria-hidden="true" />
              {running ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

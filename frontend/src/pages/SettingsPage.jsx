import { Download, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { downloadBackup, readBackupSummary, restoreBackup } from "../api/backup";
import { useAuth } from "../auth/AuthContext";
import { AiSection } from "../components/AiSection";
import { BankConnections } from "../components/BankConnections";
import { HouseholdSection } from "../components/HouseholdSection";
import { Button } from "../components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/Dialog";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { SettingRow } from "../components/ui/SettingRow";
import { useToast } from "../components/ui/Toast";
import { backupLine, plural } from "../lib/backup";

export function SettingsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hash } = useLocation();
  const fileInput = useRef(null);
  const [downloading, setDownloading] = useState(false);
  // The picked file and what it says about itself, while confirming.
  const [picked, setPicked] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // react-router doesn't scroll to a hash; the first-run links need it.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView?.();
  }, [hash]);

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadBackup();
      toast.success("Backup downloaded.");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDownloading(false);
    }
  }

  async function handlePick(event) {
    const file = event.target.files?.[0];
    // Picking the same file again must fire change again.
    event.target.value = "";
    if (!file) return;
    try {
      setPicked({ file, summary: await readBackupSummary(file) });
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const restored = await restoreBackup(picked.file);
      setPicked(null);
      toast.success(
        `Restored ${plural(restored.accounts, "account")} and ${plural(restored.transactions, "transaction")}. Reconnect your banks in Settings.`,
      );
      navigate("/");
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />

      <HouseholdSection />
      <BankConnections />
      <AiSection />

      <Panel id="backup" title="Backup">
        <div className="divide-y divide-border">
          <SettingRow
            title="Download a backup"
            text="Everything in this household in one file, except logins and bank access. Keep it somewhere safe."
          >
            <Button onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download backup
            </Button>
          </SettingRow>
          <SettingRow
            title="Restore from a backup"
            text="Replaces this household's data with the backup. Other households aren't touched."
          >
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <RotateCcw className="h-4 w-4" />
              Restore…
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              data-testid="backup-file"
              onChange={handlePick}
            />
          </SettingRow>
        </div>
      </Panel>

      <Dialog open={picked !== null} onOpenChange={(open) => !open && !restoring && setPicked(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogDescription>{picked && backupLine(picked.summary, user?.household?.name)}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 rounded-lg bg-critical/10 p-3 text-sm text-ink-primary">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
            <div className="flex flex-col gap-2">
              <p>
                Everything in this household is replaced by the backup, for all its members. Anything added or changed
                since it was made is lost. Other households aren't touched.
              </p>
              <p>Bank access isn't in the backup. Your Enable Banking key stays, and you'll reconnect your banks afterwards.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPicked(null)} disabled={restoring}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRestore} disabled={restoring}>
              {restoring && <Loader2 className="h-4 w-4 animate-spin" />}
              Replace this household's data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

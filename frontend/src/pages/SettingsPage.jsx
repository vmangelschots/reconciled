import { Download, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { downloadBackup, readBackupSummary, restoreBackup } from "../api/backup";
import { BankConnections } from "../components/BankConnections";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/Dialog";
import { PageHeader } from "../components/ui/PageHeader";
import { useToast } from "../components/ui/Toast";
import { backupLine, plural } from "../lib/backup";

function BackupRow({ title, text, children }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-ink-primary">{title}</span>
        <span className="text-sm text-ink-secondary">{text}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [downloading, setDownloading] = useState(false);
  // The picked file and what it says about itself, while confirming.
  const [picked, setPicked] = useState(null);
  const [restoring, setRestoring] = useState(false);

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
        `Restored ${plural(restored.accounts, "account")} and ${plural(restored.transactions, "transaction")}.`,
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

      <BankConnections />

      <Card>
        <CardHeader>
          <CardTitle>Backup</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <BackupRow title="Download a backup" text="Everything in Reconciled in one file. Keep it somewhere safe.">
            <Button onClick={handleDownload} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download backup
            </Button>
          </BackupRow>
          <BackupRow title="Restore from a backup" text="Replaces everything in the app with the backup.">
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
          </BackupRow>
        </CardContent>
      </Card>

      <Dialog open={picked !== null} onOpenChange={(open) => !open && !restoring && setPicked(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogDescription>{picked && backupLine(picked.summary)}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 rounded-lg bg-critical/10 p-3 text-sm text-ink-primary">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
            <p>
              Everything now in the app is replaced by the backup. Anything added or changed since it was made is
              lost.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPicked(null)} disabled={restoring}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRestore} disabled={restoring}>
              {restoring && <Loader2 className="h-4 w-4 animate-spin" />}
              Replace everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

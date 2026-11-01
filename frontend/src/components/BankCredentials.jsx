import { Check, CheckCircle2, Clock, KeyRound, Loader2, TriangleAlert, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { checkBankCredentials, saveBankCredentials } from "../api/bankSync";
import { cn } from "../lib/cn";
import { CopyField } from "./CopyField";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Input } from "./ui/Input";
import { Label } from "./ui/Label";
import { StatusBadge } from "./ui/StatusBadge";
import { Textarea } from "./ui/Textarea";
import { useToast } from "./ui/Toast";

const CONSOLE_URL = "https://enablebanking.com/cp/applications";

// What each check result means, and which step fixes it.
const STATES = {
  rejected: {
    tone: "critical",
    badge: "Key not accepted",
    text: "Enable Banking didn't accept this key. Check that it belongs to this app.",
    step: 4,
  },
  redirect_missing: {
    tone: "warning",
    badge: "Redirect URL missing",
    text: "This redirect URL isn't on your app yet. Add it in Enable Banking, then check again.",
    step: 2,
    check: true,
  },
  not_active: {
    tone: "warning",
    badge: "Waiting for activation",
    text: "Your app isn't active yet. Link your accounts in Enable Banking's Control Panel, then check again.",
    step: 3,
    check: true,
  },
  sandbox: {
    tone: "warning",
    badge: "Sandbox app",
    text: "This is a sandbox app, so real banks won't work. Create a production app.",
    step: 4,
  },
  unreachable: {
    tone: "warning",
    badge: "Not checked",
    text: "Saved, but Enable Banking couldn't be reached to check it.",
    step: 4,
    check: true,
  },
};

export function credentialsBadge(credentials) {
  if (!credentials || credentials.state === "not_set_up") return null;
  if (credentials.state === "ready") {
    return (
      <StatusBadge tone="positive" icon={<CheckCircle2 className="h-3 w-3" />}>
        Ready
      </StatusBadge>
    );
  }
  const state = STATES[credentials.state];
  const Icon = state.tone === "critical" ? TriangleAlert : Clock;
  return (
    <StatusBadge tone={state.tone} icon={<Icon className="h-3 w-3" />}>
      {state.badge}
    </StatusBadge>
  );
}

function shortened(appId) {
  return appId.length > 12 ? `${appId.slice(0, 4)}…${appId.slice(-4)}` : appId;
}

function Step({ number, title, state, onOpen, children }) {
  return (
    <li className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          state === "current" ? "bg-accent/15 text-accent" : "text-ink-muted ring-1 ring-border",
        )}
      >
        {state === "done" ? <Check className="h-3 w-3" /> : number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("text-sm", state === "current" ? "font-medium text-ink-primary" : "text-ink-secondary")}>
            {title}
          </span>
          {state === "done" && (
            <Button variant="ghost" size="sm" onClick={onOpen}>
              Edit
            </Button>
          )}
        </div>
        {state === "current" && children}
      </div>
    </li>
  );
}

function KeyForm({ initialAppId, onSaved, onCancel }) {
  const toast = useToast();
  const fileInput = useRef(null);
  const [appId, setAppId] = useState(initialAppId);
  const [key, setKey] = useState("");
  const [fileName, setFileName] = useState("");
  const [pasting, setPasting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setKey(await file.text());
    setFileName(file.name);
    if (file.name.endsWith(".pem")) setAppId(file.name.slice(0, -".pem".length));
  }

  async function save() {
    setSaving(true);
    try {
      await saveBankCredentials({ app_id: appId, private_key: key });
      // The key leaves the browser once.
      setKey("");
      await onSaved();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-3">
      {pasting ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bank-key">Private key</Label>
          <Textarea
            id="bank-key"
            className="font-mono text-xs"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="-----BEGIN PRIVATE KEY-----"
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" />
            Upload .pem file
          </Button>
          <Button variant="ghost" onClick={() => setPasting(true)}>
            Paste the key instead
          </Button>
          {fileName && <span className="text-sm text-ink-secondary">{fileName}</span>}
          <input
            ref={fileInput}
            type="file"
            accept=".pem"
            className="hidden"
            data-testid="bank-key-file"
            onChange={pick}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bank-app-id">Application ID</Label>
        <Input id="bank-app-id" value={appId} onChange={(e) => setAppId(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button onClick={save} disabled={saving || !key || !appId}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function ReplaceDialog({ open, onConfirm, onCancel }) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onCancel()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Replace the key?</DialogTitle>
          <DialogDescription>
            Your current key stops being used. If this is a different app, you'll need to reconnect your banks.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Replace key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SavedKey({ onReplace }) {
  return (
    <div className="flex max-w-md items-center gap-2 rounded-lg bg-surface-2 p-3 text-sm text-ink-secondary">
      <KeyRound className="h-4 w-4 shrink-0" />
      <span className="flex-1">Key saved. It can't be shown again.</span>
      <Button variant="outline" size="sm" onClick={onReplace}>
        Replace key
      </Button>
    </div>
  );
}

// Setting up a household's own Enable Banking app - see specs/bank-sync.
export function BankCredentials({ credentials, onChange }) {
  const toast = useToast();
  const state = STATES[credentials.state];
  const notSetUp = credentials.state === "not_set_up";
  const [step, setStep] = useState(null);
  const [askingReplace, setAskingReplace] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [checking, setChecking] = useState(false);
  const current = step ?? state?.step ?? 1;

  async function checkAgain() {
    setChecking(true);
    try {
      await checkBankCredentials();
      await onChange();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setChecking(false);
    }
  }

  function startReplacing() {
    setAskingReplace(false);
    setReplacing(true);
    setStep(4);
  }

  async function saved() {
    setReplacing(false);
    setStep(null);
    await onChange();
  }

  const replaceDialog = (
    <ReplaceDialog open={askingReplace} onConfirm={startReplacing} onCancel={() => setAskingReplace(false)} />
  );
  const stopped = credentials.stopped && (
    <div className="flex gap-2 rounded-lg bg-warning/10 p-3 text-sm text-ink-primary">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <span>Bank sync stopped because Enable Banking no longer accepts your key. Your transactions are safe.</span>
    </div>
  );

  if (credentials.state === "ready" && !replacing) {
    return (
      <>
        {stopped}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-secondary">
          <span>Enable Banking is set up · App {shortened(credentials.app_id)} · Key saved</span>
          <Button variant="outline" size="sm" onClick={() => setAskingReplace(true)}>
            Replace key
          </Button>
        </div>
        {replaceDialog}
      </>
    );
  }

  const stateOf = (number) => (number === current ? "current" : number < current ? "done" : "pending");
  const showForm = notSetUp || replacing;

  return (
    <div className="flex flex-col gap-3">
      {stopped}
      {notSetUp && (
        <p className="text-sm text-ink-secondary">
          Connect your bank to get new transactions automatically. Setup takes about 15 minutes.
        </p>
      )}
      <ol className="divide-y divide-border">
        <Step number={1} title="Create a free Enable Banking account" state={stateOf(1)} onOpen={() => setStep(1)}>
          <p className="text-sm text-ink-secondary">
            Sign up at{" "}
            <a className="text-accent underline" href={CONSOLE_URL} target="_blank" rel="noreferrer">
              enablebanking.com
            </a>{" "}
            and open API applications.
          </p>
          <div>
            <Button size="sm" onClick={() => setStep(2)}>
              Next
            </Button>
          </div>
        </Step>
        <Step number={2} title="Add a production application" state={stateOf(2)} onOpen={() => setStep(2)}>
          <p className="text-sm text-ink-secondary">Paste this redirect URL when asked:</p>
          <CopyField value={credentials.redirect_url} label="redirect URL" />
          <div>
            <Button size="sm" onClick={() => setStep(3)}>
              Next
            </Button>
          </div>
        </Step>
        <Step number={3} title="Link your bank accounts to the app" state={stateOf(3)} onOpen={() => setStep(3)}>
          <p className="text-sm text-ink-secondary">Do this in Enable Banking's Control Panel.</p>
          <div>
            <Button size="sm" onClick={() => setStep(4)}>
              Next
            </Button>
          </div>
        </Step>
        <Step number={4} title="Upload the .pem file your browser downloaded" state={stateOf(4)} onOpen={() => setStep(4)}>
          {showForm ? (
            <KeyForm
              initialAppId={credentials.app_id}
              onSaved={saved}
              onCancel={replacing ? () => { setReplacing(false); setStep(null); } : null}
            />
          ) : (
            <SavedKey onReplace={() => setAskingReplace(true)} />
          )}
        </Step>
      </ol>
      {state && !replacing && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg p-3 text-sm text-ink-primary",
            state.tone === "critical" ? "bg-critical/10" : "bg-warning/10",
          )}
        >
          <span className="flex gap-2">
            <TriangleAlert
              className={cn("mt-0.5 h-4 w-4 shrink-0", state.tone === "critical" ? "text-critical" : "text-warning")}
            />
            {state.text}
          </span>
          {state.check && (
            <Button variant="outline" size="sm" onClick={checkAgain} disabled={checking}>
              {checking && <Loader2 className="h-4 w-4 animate-spin" />}
              Check again
            </Button>
          )}
        </div>
      )}
      {replaceDialog}
    </div>
  );
}

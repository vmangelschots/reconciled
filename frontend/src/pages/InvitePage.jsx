import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { acceptInvite, getInvite } from "../api/household";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Label } from "../components/ui/Label";
import { PillSwitch } from "../components/ui/PillSwitch";
import { useToast } from "../components/ui/Toast";

const GONE = "This invite link no longer works. Ask for a new one.";
const MODES = [
  { value: "new", label: "New login" },
  { value: "existing", label: "I have a login" },
];

function Shell({ children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-ink-primary">reconciled</h1>
        {children}
      </div>
    </main>
  );
}

// Open without signing in. See specs/households, "Accept an invite".
export function InvitePage() {
  const { token } = useParams();
  const toast = useToast();
  const [invite, setInvite] = useState(null);
  const [gone, setGone] = useState(false);
  const [mode, setMode] = useState("new");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getInvite(token)
      .then(setInvite)
      .catch(() => setGone(true));
  }, [token]);

  async function accept(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const signedIn = invite.signed_in_as !== null;
      await acceptInvite(token, signedIn ? {} : { username, password, existing: mode === "existing" });
      window.location.assign("/");
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
      setSubmitting(false);
    }
  }

  if (gone) {
    return (
      <Shell>
        <p className="text-sm text-ink-secondary">{GONE}</p>
      </Shell>
    );
  }
  if (invite === null) {
    return (
      <Shell>
        <p className="text-sm text-ink-secondary">Loading…</p>
      </Shell>
    );
  }
  if (invite.already_member) {
    return (
      <Shell>
        <p className="text-sm text-ink-secondary">You're already a member of {invite.household}.</p>
        <Button onClick={() => window.location.assign("/")}>Open Reconciled</Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink-primary">You're invited to join {invite.household}.</p>
        <p className="text-sm text-ink-secondary">Members see all of the household's data.</p>
      </div>
      <form onSubmit={accept} className="flex flex-col gap-4">
        {invite.signed_in_as === null && (
          <>
            <PillSwitch label="Your login" options={MODES} value={mode} onChange={setMode} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "new" ? "new-password" : "current-password"}
                required
              />
            </div>
          </>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Joining..." : invite.signed_in_as ? `Join as ${invite.signed_in_as}` : "Join"}
        </Button>
      </form>
    </Shell>
  );
}

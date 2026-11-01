import { Loader2, Trash2, User, UserPlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { changePassword, createInvite, getHousehold, leaveHousehold, revokeInvite } from "../api/household";
import { CopyField } from "./CopyField";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Input } from "./ui/Input";
import { Label } from "./ui/Label";
import { ListRow } from "./ui/ListRow";
import { Panel } from "./ui/Panel";
import { StatusBadge } from "./ui/StatusBadge";
import { useToast } from "./ui/Toast";

const expiryDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

function PasswordDialog({ open, onClose }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await changePassword({ current_password: current, new_password: next });
      toast.success("Password changed.");
      setCurrent("");
      setNext("");
      onClose();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>You'll stay signed in here.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Change password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// The household, who's in it, and getting people in. See specs/households.
export function HouseholdSection() {
  const toast = useToast();
  const toastRef = useRef(toast);
  const [household, setHousehold] = useState(null);
  const [newLink, setNewLink] = useState(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setHousehold(await getHousehold());
    } catch (e) {
      toastRef.current.error(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function invite() {
    try {
      const created = await createInvite();
      setNewLink(`${window.location.origin}/invite/${created.token}`);
      await load();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  async function revoke(id) {
    try {
      await revokeInvite(id);
      setNewLink(null);
      await load();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  async function leave() {
    try {
      await leaveHousehold();
      window.location.assign("/");
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  return (
    <Panel
      flush
      title={household?.name ?? "Household"}
      loading={household === null}
      actions={
        <Button variant="outline" size="sm" onClick={() => setChangingPassword(true)}>
          Change password
        </Button>
      }
    >
      {household && (
        <>
          <ul className="divide-y divide-border border-t border-border">
            {household.members.map((member) => (
              <ListRow
                key={member.username}
                icon={<User className="h-4 w-4" />}
                primary={member.username}
                end={member.you && <StatusBadge>You</StatusBadge>}
              />
            ))}
            {household.invites.map((pending) => (
              <ListRow
                key={pending.id}
                icon={<UserPlus className="h-4 w-4" />}
                primary="Invite waiting"
                secondary={`From ${pending.created_by ?? "the person who runs Reconciled"}, until ${expiryDate.format(new Date(pending.expires_at))}`}
                end={
                  <Button variant="ghost" size="sm" onClick={() => revoke(pending.id)}>
                    <Trash2 className="h-4 w-4" />
                    Revoke
                  </Button>
                }
              />
            ))}
          </ul>
          <div className="flex flex-col gap-3 border-t border-border px-5 py-4">
            {newLink && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-ink-secondary">
                  Send this link to the person you're inviting. It works once, for 7 days, and this is the only time
                  it's shown.
                </p>
                <CopyField value={newLink} label="invite link" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={invite}>
                <UserPlus className="h-4 w-4" />
                Invite someone
              </Button>
              {household.can_leave && (
                <Button variant="ghost" onClick={() => setLeaving(true)}>
                  Leave household
                </Button>
              )}
            </div>
            <p className="text-xs text-ink-muted">Everyone in a household sees all of its data.</p>
          </div>

          <PasswordDialog open={changingPassword} onClose={() => setChangingPassword(false)} />
          <Dialog open={leaving} onOpenChange={setLeaving}>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Leave {household.name}?</DialogTitle>
                <DialogDescription>
                  You'll lose access to it. Its data stays, and you'd need a new invite to come back.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLeaving(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={leave}>
                  Leave household
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </Panel>
  );
}

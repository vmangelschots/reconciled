import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createToken, listTokens, mcpEndpoint, revokeToken } from "../api/mcpTokens";
import { clientSnippet, created, lastUsed } from "../lib/mcp";
import { CopyField } from "./CopyField";
import { Button } from "./ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/Dialog";
import { Input } from "./ui/Input";
import { Label } from "./ui/Label";
import { ListRow } from "./ui/ListRow";
import { Panel } from "./ui/Panel";
import { useToast } from "./ui/Toast";

/** A multi-line value, such as a config snippet, with a copy button. */
function CopyBlock({ value, label }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("Copied.");
    } catch {
      toast.success("Select the text and press Ctrl+C");
    }
  }

  return (
    <div className="relative max-w-xl">
      <pre
        aria-label={label}
        className="overflow-x-auto rounded-lg bg-surface-2 p-3 pr-12 font-mono text-xs leading-relaxed text-ink-primary"
      >
        {value}
      </pre>
      <Button
        variant="outline"
        size="icon"
        aria-label={`Copy ${label}`}
        onClick={copy}
        className="absolute right-2 top-2"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

// Tokens that let an AI assistant read this household. See specs/access-tokens.
export function McpAccessSection() {
  const toast = useToast();
  const toastRef = useRef(toast);
  const [tokens, setTokens] = useState(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(null);
  const [creating, setCreating] = useState(false);
  // The token just created, the only time its secret is known here.
  const [fresh, setFresh] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const endpoint = mcpEndpoint();

  const load = useCallback(async () => {
    try {
      setTokens(await listTokens());
    } catch (e) {
      toastRef.current.error(e.message);
    }
  }, []);

  useEffect(() => {
    listTokens()
      .then(setTokens)
      .catch((e) => toastRef.current.error(e.message));
  }, []);

  async function create(event) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError("Give the token a name.");
      return;
    }
    setCreating(true);
    try {
      setFresh(await createToken(name.trim()));
      setName("");
      setNameError(null);
      await load();
    } catch (e) {
      if (e.data?.name) setNameError(e.data.name[0]);
      else toast.error(e.data?.detail ?? e.message);
    } finally {
      setCreating(false);
    }
  }

  async function revoke() {
    try {
      await revokeToken(revoking.id);
      if (fresh?.id === revoking.id) setFresh(null);
      setRevoking(null);
      await load();
    } catch (e) {
      toast.error(e.data?.detail ?? e.message);
    }
  }

  return (
    <Panel id="mcp" flush title="MCP access" loading={tokens === null}>
      {tokens && (
        <>
          <div className="flex flex-col gap-1 px-5 pb-4">
            <p className="text-sm text-ink-secondary">
              Let an AI assistant such as Claude Code or Claude Desktop read this household's budget, transactions and
              reports. It can't change anything.
            </p>
            <p className="text-sm text-ink-secondary">
              With a token, an assistant can read all of this household's data, and passes what it reads on to its
              model provider.
            </p>
          </div>

          {tokens.length > 0 && (
            <ul className="divide-y divide-border border-t border-border">
              {tokens.map((token) => (
                <ListRow
                  key={token.id}
                  icon={<KeyRound className="h-4 w-4" />}
                  primary={token.name}
                  secondary={`${token.shown}… · ${created(token.created_at)} · ${lastUsed(token.last_used_at)}`}
                  end={
                    <Button variant="ghost" size="sm" onClick={() => setRevoking(token)}>
                      <Trash2 className="h-4 w-4" />
                      Revoke
                    </Button>
                  }
                />
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
            {fresh && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm text-ink-secondary">
                  Copy “{fresh.name}” now. It won't be shown again.
                </p>
                <CopyField value={fresh.token} label="access token" />
              </div>
            )}

            <form onSubmit={create} noValidate className="flex flex-col gap-1.5">
              <Label htmlFor="mcp-token-name">New token</Label>
              <div className="flex max-w-md flex-wrap gap-2">
                <Input
                  id="mcp-token-name"
                  placeholder="e.g. Laptop Claude Code"
                  maxLength={100}
                  value={name}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? "mcp-token-name-error" : undefined}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  className="min-w-0 flex-1"
                />
                <Button type="submit" variant="outline" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create token
                </Button>
              </div>
              {nameError && (
                <p id="mcp-token-name-error" className="text-xs text-critical">
                  {nameError}
                </p>
              )}
            </form>

            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-ink-primary">Connect a client</p>
              <CopyField value={endpoint} label="MCP endpoint" />
              <CopyBlock value={clientSnippet(endpoint, fresh?.token)} label="client configuration" />
              {!fresh && (
                <p className="text-xs text-ink-muted">Create a token to fill it in, or paste yours in its place.</p>
              )}
            </div>
          </div>

          <Dialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Revoke “{revoking?.name}”?</DialogTitle>
                <DialogDescription>
                  Any assistant using it loses access at once. This can't be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRevoking(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={revoke}>
                  Revoke token
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </Panel>
  );
}

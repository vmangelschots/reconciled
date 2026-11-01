import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { useToast } from "./ui/Toast";

/** A read-only value with a copy button. Browsers have no clipboard on a
 * plain-http address, so there it selects the text and says what to press. */
export function CopyField({ value, label }) {
  const toast = useToast();
  const input = useRef(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    input.current?.select();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("Copied.");
    } catch {
      toast.success("Press Ctrl+C");
    }
  }

  return (
    <div className="flex max-w-md gap-2">
      <Input
        ref={input}
        readOnly
        value={value}
        aria-label={label}
        className="font-mono text-xs"
        onClick={(e) => e.target.select()}
      />
      <Button variant="outline" size="icon" aria-label={`Copy ${label}`} onClick={copy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

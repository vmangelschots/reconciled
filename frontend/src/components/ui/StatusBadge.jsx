import { cn } from "../../lib/cn";

const TONES = {
  neutral: "bg-surface-2 text-ink-muted ring-1 ring-border",
  positive: "bg-positive/10 text-positive",
  warning: "bg-warning/10 text-warning",
  critical: "bg-critical/10 text-critical",
};

/** A short status chip. */
export function StatusBadge({ tone = "neutral", icon, children }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone])}>
      {icon}
      {children}
    </span>
  );
}

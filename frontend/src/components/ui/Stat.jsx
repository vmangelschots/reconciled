import { cn } from "../../lib/cn";
import { Skeleton } from "./Skeleton";

const TONES = {
  default: "text-ink-primary",
  positive: "text-positive",
  warning: "text-warning",
  critical: "text-critical",
};

/**
 * A headline figure: a small caps label (with an optional note such as
 * "Today"), the figure, and anything below it (`children`: a detail
 * line, a progress bar).
 */
export function Stat({ label, note, value, tone = "default", loading = false, children, className }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</span>
        {note && <span className="text-xs text-ink-muted">· {note}</span>}
      </div>
      {loading ? (
        <Skeleton className="my-1 h-8 w-32" />
      ) : (
        <span className={cn("num text-2xl font-semibold tracking-tight sm:text-3xl", TONES[tone])}>{value}</span>
      )}
      {!loading && children}
    </div>
  );
}

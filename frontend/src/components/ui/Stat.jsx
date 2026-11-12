import { cn } from "../../lib/cn";
import { Skeleton } from "./Skeleton";

const TONES = {
  default: "text-ink-primary",
  positive: "text-positive",
  warning: "text-warning",
  critical: "text-critical",
};

const SIZES = {
  default: "text-2xl sm:text-3xl",
  // Three in a row at a phone's width - see the Forecast page.
  sm: "text-lg sm:text-2xl",
};

/**
 * A headline figure: a small caps label (with an optional note such as
 * "Today"), the figure, and anything below it (`children`: a detail
 * line, a progress bar). `detail` is a muted line under the figure.
 */
export function Stat({
  label,
  note,
  value,
  detail,
  tone = "default",
  size = "default",
  loading = false,
  children,
  className,
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</span>
        {note && <span className="text-xs text-ink-muted">· {note}</span>}
      </div>
      {loading ? (
        <Skeleton className="my-1 h-8 w-32" />
      ) : (
        <span className={cn("num font-semibold tracking-tight", SIZES[size], TONES[tone])}>{value}</span>
      )}
      {!loading && detail && <span className="text-xs text-ink-muted">{detail}</span>}
      {!loading && children}
    </div>
  );
}
